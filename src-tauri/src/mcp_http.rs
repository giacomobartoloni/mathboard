// MathBoard
//
// Copyright (C) 2026 Giacomo Bartoloni
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

//! Loopback-only MCP Streamable HTTP transport. No MCP state is stored in the board WebView.

use crate::board_bridge::{BoardRequestBroker, McpReadLease};
use crate::mcp_contract::ToolCall;
use crate::mcp_ipc_client::read_reply_result;
use crate::mcp_ipc_protocol::IpcCommand;
use crate::mcp_native;
use crate::mcp_server::{MathBoardMcpServer, McpReadBackend, McpReadError, McpReadReceipt};
use bytes::Bytes;
use http_body_util::{BodyExt, Full, combinators::BoxBody};
use hyper::{
    Request, Response, StatusCode,
    body::Incoming,
    header::{AUTHORIZATION, HOST, ORIGIN, HeaderMap},
    service::{Service, service_fn},
};
use hyper_util::{rt::TokioIo, service::TowerToHyperService};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use std::{
    convert::Infallible,
    io,
    net::TcpListener,
    sync::{Arc, Mutex, mpsc},
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::Manager;
use tokio_util::sync::CancellationToken;

const BIND_ADDRESS: &str = "127.0.0.1:43179";
pub const ENDPOINT: &str = "http://127.0.0.1:43179/mcp";
const MAX_HTTP_BODY: usize = 64 * 1024;
const MAX_CONNECTIONS: usize = 16;

#[derive(Clone)]
struct NativeAppBackend(tauri::AppHandle);

impl McpReadBackend for NativeAppBackend {
    type Lease = McpReadLease;

    async fn visible_methods(&self) -> Vec<&'static str> {
        self.0.state::<BoardRequestBroker>().mcp_visible_methods()
    }

    async fn read(&self, call: ToolCall) -> Result<McpReadReceipt<Self::Lease>, McpReadError> {
        let app = self.0.clone();
        tokio::task::spawn_blocking(move || {
            let broker = app.state::<BoardRequestBroker>();
            read_reply_result(mcp_native::dispatch(&app, &broker, IpcCommand::Read(call)))
        })
        .await
        .map_err(|_| McpReadError::Unavailable)?
    }

    async fn lease_valid(&self, lease: &Self::Lease) -> bool {
        self.0.state::<BoardRequestBroker>().mcp_lease_valid(lease)
    }

    async fn release_lease(&self, lease: Self::Lease) {
        self.0
            .state::<BoardRequestBroker>()
            .mcp_release_lease(&lease);
    }
}

fn same_token(provided: &str, expected: &str) -> bool {
    let a = provided.as_bytes();
    let b = expected.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b)
        .fold(0u8, |diff, (left, right)| diff | (left ^ right))
        == 0
}

/// Browser requests, DNS rebinding and unrelated local processes fail closed.
/// The ephemeral token is available only through the native settings window.
fn admitted(headers: &HeaderMap, path: &str, token: &str, enabled: bool) -> bool {
    if !enabled || path != "/mcp" || headers.contains_key(ORIGIN) {
        return false;
    }
    let valid_host = headers
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        == Some(BIND_ADDRESS);
    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    valid_host && bearer.is_some_and(|value| same_token(value, token))
}

fn denied() -> Response<BoxBody<Bytes, Infallible>> {
    Response::builder()
        .status(StatusCode::FORBIDDEN)
        .header("Cache-Control", "no-store")
        .body(Full::new(Bytes::new()).boxed())
        .expect("valid denial response")
}

async fn serve(
    socket: TcpListener,
    app: tauri::AppHandle,
    token: String,
    shutdown: CancellationToken,
) -> io::Result<()> {
    let listener = tokio::net::TcpListener::from_std(socket)?;
    let settings = StreamableHttpServerConfig::default()
        .with_allowed_hosts([BIND_ADDRESS])
        .enforce_origin_validation()
        .with_max_request_body_bytes(MAX_HTTP_BODY)
        .with_json_response(true)
        .with_cancellation_token(shutdown.child_token());

    let service = TowerToHyperService::new(StreamableHttpService::new(
        {
            let app = app.clone();
            move || Ok(MathBoardMcpServer::new(NativeAppBackend(app.clone())))
        },
        Arc::new(LocalSessionManager::default()),
        settings,
    ));
    let slots = Arc::new(tokio::sync::Semaphore::new(MAX_CONNECTIONS));
    loop {
        let accept = tokio::select! {
            _ = shutdown.cancelled() => break,
            accept = listener.accept() => accept,
        };
        let (stream, _) = accept?;
        let Ok(slot) = slots.clone().try_acquire_owned() else {
            continue;
        };
        let service = service.clone();
        let app = app.clone();
        let token = token.clone();
        tokio::spawn(async move {
            let _slot = slot;
            let handler = service_fn(move |request: Request<Incoming>| {
                let service = service.clone();
                let app = app.clone();
                let token = token.clone();
                async move {
                    let enabled = app.state::<BoardRequestBroker>().mcp_status().enabled;
                    if !admitted(request.headers(), request.uri().path(), &token, enabled) {
                        return Ok::<_, Infallible>(denied());
                    }
                    let response = service.call(request).await.unwrap_or_else(|never| match never {});
                    Ok::<_, Infallible>(response)
                }
            });
            let _ = hyper::server::conn::http1::Builder::new()
                .serve_connection(TokioIo::new(stream), handler)
                .await;
        });
    }
    Ok(())
}

pub struct LocalMcpHttpServer {
    token: String,
    shutdown: CancellationToken,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl LocalMcpHttpServer {
    pub fn start(app: tauri::AppHandle) -> io::Result<Self> {
        let listener = TcpListener::bind(BIND_ADDRESS)?;
        listener.set_nonblocking(true)?;
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let shutdown = CancellationToken::new();
        let cancel = shutdown.clone();
        let secret = token.clone();
        let (started, ready) = mpsc::sync_channel(1);
        let worker = thread::Builder::new()
            .name("mathboard-mcp-http".into())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build();
                match runtime {
                    Ok(runtime) => {
                        // The bound listener is already exclusive; report readiness
                        // only after Tokio has accepted the socket.
                        let result = runtime.block_on(async {
                            let listener = tokio::net::TcpListener::from_std(listener);
                            if listener.is_err() {
                                return Err(io::Error::other("MCP HTTP listener unavailable"));
                            }
                            let listener = listener?;
                            started.send(Ok(())).ok();
                            let socket = listener.into_std()?;
                            serve(socket, app, secret, cancel).await
                        });
                        if result.is_err() {
                            eprintln!("Local MCP HTTP service stopped.");
                        }
                    }
                    Err(_) => {
                        started.send(Err(io::Error::other("MCP HTTP runtime unavailable"))).ok();
                    }
                }
            })?;
        match ready.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(Self {
                token,
                shutdown,
                worker: Mutex::new(Some(worker)),
            }),
            Ok(Err(error)) => {
                shutdown.cancel();
                let _ = worker.join();
                Err(error)
            }
            Err(_) => {
                shutdown.cancel();
                let _ = worker.join();
                Err(io::Error::other("MCP HTTP listener startup timed out"))
            }
        }
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn shutdown(&self) {
        self.shutdown.cancel();
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}

impl Drop for LocalMcpHttpServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_requests_require_a_valid_token_and_no_browser_origin() {
        let token = "0123456789abcdef0123456789abcdef";
        let mut headers = HeaderMap::new();
        headers.insert(HOST, BIND_ADDRESS.parse().unwrap());
        headers.insert(AUTHORIZATION, format!("Bearer {token}").parse().unwrap());
        assert!(admitted(&headers, "/mcp", token, true));
        assert!(!admitted(&headers, "/mcp", token, false));
        assert!(!admitted(&headers, "/other", token, true));
        headers.insert(ORIGIN, "https://malicious.example".parse().unwrap());
        assert!(!admitted(&headers, "/mcp", token, true));
        headers.remove(ORIGIN);
        headers.insert(HOST, "attacker.example".parse().unwrap());
        assert!(!admitted(&headers, "/mcp", token, true));
        headers.insert(HOST, BIND_ADDRESS.parse().unwrap());
        headers.insert(AUTHORIZATION, "Bearer wrong".parse().unwrap());
        assert!(!admitted(&headers, "/mcp", token, true));
    }

    #[test]
    fn token_check_rejects_truncated_and_wrong_equal_length_values() {
        assert!(same_token("abc", "abc"));
        assert!(!same_token("ab", "abc"));
        assert!(!same_token("abz", "abc"));
    }
}
