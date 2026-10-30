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
    header::{HOST, HeaderMap, ORIGIN},
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

const LOOPBACK_HOST: &str = "127.0.0.1";
pub const PREFERRED_PORT: u16 = 43179;

fn endpoint_for(port: u16) -> String {
    format!("http://{LOOPBACK_HOST}:{port}/mcp")
}

/// Keep the successful bound socket; checking and then rebinding would race.
fn bind_first_available(start_port: u16) -> io::Result<(TcpListener, u16)> {
    for port in start_port..=u16::MAX {
        match TcpListener::bind((LOOPBACK_HOST, port)) {
            Ok(listener) => return Ok((listener, port)),
            Err(error) if error.kind() == io::ErrorKind::AddrInUse => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AddrInUse,
        "No available loopback MCP HTTP port at or above the preferred port",
    ))
}
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

/// Native enablement and strict loopback Host/Origin checks form the local MCP gate.
/// This endpoint intentionally does not authenticate other local applications.
fn admitted(headers: &HeaderMap, path: &str, enabled: bool, bound_host: &str) -> bool {
    if !enabled || path != "/mcp" || headers.contains_key(ORIGIN) {
        return false;
    }
    headers.get(HOST).and_then(|value| value.to_str().ok()) == Some(bound_host)
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
    shutdown: CancellationToken,
    bound_host: String,
) -> io::Result<()> {
    let listener = tokio::net::TcpListener::from_std(socket)?;
    let settings = StreamableHttpServerConfig::default()
        .with_allowed_hosts([bound_host.clone()])
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
            biased;
            _ = shutdown.cancelled() => break,
            accept = listener.accept() => accept,
        };
        let (stream, _) = accept?;
        let Ok(slot) = slots.clone().try_acquire_owned() else {
            continue;
        };
        let service = service.clone();
        let app = app.clone();
        let bound_host = bound_host.clone();
        tokio::spawn(async move {
            let _slot = slot;
            let handler = service_fn(move |request: Request<Incoming>| {
                let service = service.clone();
                let app = app.clone();
                let bound_host = bound_host.clone();
                async move {
                    let enabled = app.state::<BoardRequestBroker>().mcp_status().enabled;
                    if !admitted(request.headers(), request.uri().path(), enabled, &bound_host) {
                        return Ok::<_, Infallible>(denied());
                    }
                    let response = service
                        .call(request)
                        .await
                        .unwrap_or_else(|never| match never {});
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

struct RunningHttp {
    shutdown: CancellationToken,
    worker: JoinHandle<()>,
    port: u16,
}

impl RunningHttp {
    pub fn start(app: tauri::AppHandle) -> io::Result<Self> {
        let (listener, port) = bind_first_available(PREFERRED_PORT)?;
        listener.set_nonblocking(true)?;
        let bound_host = format!("{LOOPBACK_HOST}:{port}");
        let shutdown = CancellationToken::new();
        let cancel = shutdown.clone();
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
                            serve(socket, app, cancel, bound_host).await
                        });
                        if result.is_err() {
                            eprintln!("Local MCP HTTP service stopped.");
                        }
                    }
                    Err(_) => {
                        started
                            .send(Err(io::Error::other("MCP HTTP runtime unavailable")))
                            .ok();
                    }
                }
            })?;
        match ready.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => Ok(Self {
                shutdown,
                worker,
                port,
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

    fn shutdown(self) -> io::Result<()> {
        self.shutdown.cancel();
        self.worker
            .join()
            .map_err(|_| io::Error::other("MCP HTTP worker panicked"))
    }
}

/// Native MCP On/Off owns actual socket and RMCP session lifetimes.
pub struct LocalMcpHttpServer {
    app: tauri::AppHandle,
    running: Mutex<Option<RunningHttp>>,
}

impl LocalMcpHttpServer {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            running: Mutex::new(None),
        }
    }

    pub fn is_running(&self) -> bool {
        self.running
            .lock()
            .expect("MCP HTTP lifecycle lock poisoned")
            .as_ref()
            .is_some_and(|running| !running.worker.is_finished())
    }

    /// Report exactly the URL of the running listener, never a preferred-port guess.
    pub fn endpoint(&self) -> Option<String> {
        self.running
            .lock()
            .expect("MCP HTTP lifecycle lock poisoned")
            .as_ref()
            .filter(|running| !running.worker.is_finished())
            .map(|running| endpoint_for(running.port))
    }

    pub fn set_enabled(&self, broker: &BoardRequestBroker, enabled: bool) -> io::Result<()> {
        // Serialize concurrent On/Off commands and the permission epoch.
        let mut running = self
            .running
            .lock()
            .expect("MCP HTTP lifecycle lock poisoned");
        if !enabled {
            // Off is not confirmed until the runtime drops all HTTP writers.
            broker.mcp_set_enabled(false);
            if let Some(worker) = running.take() {
                worker.shutdown()?;
            }
            return Ok(());
        }

        if running
            .as_ref()
            .is_some_and(|worker| worker.worker.is_finished())
        {
            broker.mcp_set_enabled(false);
            if let Some(worker) = running.take() {
                worker.shutdown()?;
            }
        }
        if running.is_none() {
            // Bind only when requested, falling forward on occupied local ports.
            *running = Some(RunningHttp::start(self.app.clone())?);
        }
        broker.mcp_set_enabled(true);
        Ok(())
    }

    pub fn shutdown(&self, broker: &BoardRequestBroker) -> io::Result<()> {
        self.set_enabled(broker, false)
    }
}

impl Drop for LocalMcpHttpServer {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.lock() {
            if let Some(worker) = running.take() {
                let _ = worker.shutdown();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_gate_requires_native_enablement_exact_host_and_no_browser_origin() {
        let mut headers = HeaderMap::new();
        let bound_host = format!("{LOOPBACK_HOST}:{}", PREFERRED_PORT + 1);
        headers.insert(HOST, bound_host.parse().unwrap());
        assert!(admitted(&headers, "/mcp", true, &bound_host));
        assert!(!admitted(&headers, "/mcp", false, &bound_host));
        assert!(!admitted(&headers, "/other", true, &bound_host));
        headers.insert(ORIGIN, "https://malicious.example".parse().unwrap());
        assert!(!admitted(&headers, "/mcp", true, &bound_host));
        headers.remove(ORIGIN);
        headers.insert(HOST, "attacker.example".parse().unwrap());
        assert!(!admitted(&headers, "/mcp", true, &bound_host));
        headers.insert(HOST, format!("{LOOPBACK_HOST}:{PREFERRED_PORT}").parse().unwrap());
        assert!(!admitted(&headers, "/mcp", true, &bound_host));
        headers.remove(HOST);
        assert!(!admitted(&headers, "/mcp", true, &bound_host));
    }

    #[test]
    fn stopping_runtime_closes_an_already_accepted_connection() {
        use std::io::Read;
        use std::net::TcpStream;

        let socket = TcpListener::bind("127.0.0.1:0").unwrap();
        socket.set_nonblocking(true).unwrap();
        let address = socket.local_addr().unwrap();
        let shutdown = CancellationToken::new();
        let cancel = shutdown.clone();
        let (started, ready) = mpsc::sync_channel(1);
        let worker = thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap();
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(socket).unwrap();
                let (stream, _) = listener.accept().await.unwrap();
                tokio::spawn(async move {
                    let _stream = stream;
                    std::future::pending::<()>().await;
                });
                started.send(()).unwrap();
                cancel.cancelled().await;
            });
            // The active connection task is aborted when this runtime drops.
        });
        let mut client = TcpStream::connect(address).unwrap();
        ready.recv_timeout(Duration::from_secs(2)).unwrap();
        RunningHttp {
            shutdown,
            worker,
            port: address.port(),
        }
        .shutdown()
        .unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut buf = [0u8; 1];
        assert!(matches!(client.read(&mut buf), Ok(0) | Err(_)));
        assert!(TcpStream::connect(address).is_err());
    }

    #[test]
    fn occupied_port_uses_next_available_loopback_port() {
        let owner = TcpListener::bind("127.0.0.1:0").unwrap();
        let occupied = owner.local_addr().unwrap().port();
        if occupied == u16::MAX {
            return;
        }
        let (listener, selected) = bind_first_available(occupied).unwrap();
        assert!(selected > occupied);
        assert_eq!(listener.local_addr().unwrap().port(), selected);
        assert_eq!(listener.local_addr().unwrap().ip().to_string(), LOOPBACK_HOST);
        assert_eq!(endpoint_for(selected), format!("http://{LOOPBACK_HOST}:{selected}/mcp"));
    }

    #[test]
    fn occupied_last_port_fails_closed() {
        if let Ok(owner) = TcpListener::bind((LOOPBACK_HOST, u16::MAX)) {
            let error = bind_first_available(u16::MAX).unwrap_err();
            assert_eq!(error.kind(), io::ErrorKind::AddrInUse);
            drop(owner);
        }
    }
}
