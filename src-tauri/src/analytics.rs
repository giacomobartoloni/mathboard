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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

use serde_json::{Map, Value, json};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

const EVENTS_ENDPOINT: &str = "https://queue.simpleanalyticscdn.com/events";
static ACTIVE_REQUESTS: AtomicUsize = AtomicUsize::new(0);
static HTTP_CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();

fn create_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .build()
}

async fn post_payload_to(
    client: &reqwest::Client,
    endpoint: &str,
    payload: &Value,
) -> Result<(), ()> {
    let response = client
        .post(endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|_| ())?;
    response.status().is_success().then_some(()).ok_or(())
}

struct RequestPermit<'a> {
    counter: &'a AtomicUsize,
}

impl<'a> RequestPermit<'a> {
    fn try_acquire(counter: &'a AtomicUsize) -> Option<Self> {
        counter
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |active| {
                (active < 4).then_some(active + 1)
            })
            .ok()
            .map(|_| Self { counter })
    }
}

impl Drop for RequestPermit<'_> {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

fn may_send(is_dev: bool, webview_label: &str) -> bool {
    !is_dev && webview_label == "main"
}

fn build_payload(name: &str, mut metadata: Map<String, Value>, version: &str) -> Value {
    metadata.insert("runtime".into(), Value::String("desktop".into()));
    metadata.insert("app_version".into(), Value::String(version.into()));
    json!({
        "type": "event",
        "hostname": "mathboard.app",
        "path": "/",
        "event": name,
        "ua": "MathBoardDesktop/1.0 (+https://mathboard.app/)",
        "metadata": metadata,
    })
}

#[tauri::command]
pub(crate) async fn track_desktop_analytics(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    event: String,
    metadata: Map<String, Value>,
) -> Result<(), String> {
    let is_dev = tauri::is_dev();
    if !may_send(is_dev, webview.label()) {
        return if is_dev {
            Ok(())
        } else {
            Err("Analytics unavailable".into())
        };
    }
    let _permit =
        RequestPermit::try_acquire(&ACTIVE_REQUESTS).ok_or_else(|| "Analytics busy".to_string())?;
    let client = HTTP_CLIENT
        .get_or_init(|| create_client().ok())
        .as_ref()
        .ok_or_else(|| "Analytics unavailable".to_string())?;
    let payload = build_payload(&event, metadata, &app.package_info().version.to_string());
    post_payload_to(client, EVENTS_ENDPOINT, &payload)
        .await
        .map_err(|_| "Analytics unavailable".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, Instant};

    fn metadata(value: Value) -> Map<String, Value> {
        value.as_object().expect("object fixture").clone()
    }

    #[test]
    fn provider_payload_contains_only_fixed_fields_and_native_globals() {
        let payload = build_payload(
            "object_created",
            metadata(json!({ "object_type": "formula" })),
            "1.10.0",
        );
        assert_eq!(
            payload,
            json!({
                "type": "event",
                "hostname": "mathboard.app",
                "path": "/",
                "event": "object_created",
                "ua": "MathBoardDesktop/1.0 (+https://mathboard.app/)",
                "metadata": {
                    "object_type": "formula",
                    "runtime": "desktop",
                    "app_version": "1.10.0"
                }
            })
        );
    }

    #[test]
    fn native_payload_forwards_events_and_metadata_without_schema_validation() {
        let payload = build_payload(
            "custom_event",
            metadata(json!({
                "category": "sample",
                "extra": { "nested": true },
                "runtime": "web",
                "app_version": "untrusted"
            })),
            "1.10.0",
        );
        assert_eq!(payload["event"], "custom_event");
        assert_eq!(
            payload["metadata"],
            json!({
                "category": "sample",
                "extra": { "nested": true },
                "runtime": "desktop",
                "app_version": "1.10.0"
            })
        );
    }

    #[test]
    fn native_delivery_guard_rejects_dev_and_non_main_webviews() {
        assert!(!may_send(true, "main"));
        assert!(!may_send(false, "child"));
        assert!(may_send(false, "main"));
    }

    #[test]
    fn native_permit_caps_direct_invocations_and_releases_on_drop() {
        let active = AtomicUsize::new(0);
        let mut permits: Vec<_> = (0..4)
            .map(|_| RequestPermit::try_acquire(&active).expect("first four requests admitted"))
            .collect();
        assert_eq!(active.load(Ordering::SeqCst), 4);
        assert!(RequestPermit::try_acquire(&active).is_none());
        drop(permits.pop());
        assert_eq!(active.load(Ordering::SeqCst), 3);
        assert!(RequestPermit::try_acquire(&active).is_some());
    }

    #[test]
    fn native_permit_stays_bounded_when_direct_invocations_race() {
        let active = Arc::new(AtomicUsize::new(0));
        let admitted = Arc::new(AtomicUsize::new(0));
        let start = Arc::new(Barrier::new(17));
        let attempted = Arc::new(Barrier::new(17));
        let release = Arc::new(Barrier::new(17));
        let handles: Vec<_> = (0..16)
            .map(|_| {
                let (active, admitted, start, attempted, release) = (
                    active.clone(),
                    admitted.clone(),
                    start.clone(),
                    attempted.clone(),
                    release.clone(),
                );
                thread::spawn(move || {
                    start.wait();
                    let permit = RequestPermit::try_acquire(&active);
                    if permit.is_some() {
                        admitted.fetch_add(1, Ordering::SeqCst);
                    }
                    attempted.wait();
                    release.wait();
                    drop(permit);
                })
            })
            .collect();
        start.wait();
        attempted.wait();
        assert_eq!(admitted.load(Ordering::SeqCst), 4);
        release.wait();
        for handle in handles {
            handle.join().expect("request thread");
        }
        assert_eq!(active.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn native_http_request_preserves_supplied_metadata() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        let endpoint = format!(
            "http://{}/events",
            listener.local_addr().expect("test address")
        );
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("test request");
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .expect("request timeout");
            let mut reader = BufReader::new(stream.try_clone().expect("request reader"));
            let mut request_line = String::new();
            reader.read_line(&mut request_line).expect("request line");
            assert!(request_line.starts_with("POST /events HTTP/1.1"));

            let mut content_length = None;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).expect("request header");
                if line == "\r\n" {
                    break;
                }
                if let Some((name, value)) = line.split_once(':') {
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = Some(value.trim().parse::<usize>().expect("body length"));
                    }
                }
            }
            let mut body = vec![0; content_length.expect("Content-Length header")];
            reader.read_exact(&mut body).expect("request body");
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .expect("test response");
            serde_json::from_slice::<Value>(&body).expect("JSON event body")
        });

        let event_metadata = metadata(json!({ "object_type": "shape", "shape": "arrow" }));
        let payload = build_payload("object_created", event_metadata, "1.10.0");
        let client = create_client().expect("native client");
        tauri::async_runtime::block_on(post_payload_to(&client, &endpoint, &payload))
            .expect("provider accepted event");
        assert_eq!(
            server.join().expect("test server"),
            json!({
                "type": "event", "hostname": "mathboard.app", "path": "/",
                "event": "object_created", "ua": "MathBoardDesktop/1.0 (+https://mathboard.app/)",
                "metadata": {
                    "object_type": "shape", "shape": "arrow",
                    "runtime": "desktop", "app_version": "1.10.0"
                }
            })
        );
    }

    #[test]
    fn native_client_refuses_provider_redirects() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
        listener
            .set_nonblocking(true)
            .expect("nonblocking listener");
        let endpoint = format!(
            "http://{}/events",
            listener.local_addr().expect("test address")
        );
        let server = thread::spawn(move || {
            // Allow the client's full timeout to reach the test listener.
            // Only begin observing for an unexpected redirect after the first request.
            let mut deadline = Instant::now() + Duration::from_secs(5);
            let mut requests = 0;
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let mut request = [0_u8; 2048];
                        let _ = stream.read(&mut request);
                        requests += 1;
                        if requests == 1 {
                            deadline = Instant::now() + Duration::from_secs(1);
                        }
                        let response = if requests == 1 {
                            "HTTP/1.1 302 Found\r\nLocation: /next\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        } else {
                            "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        };
                        stream
                            .write_all(response.as_bytes())
                            .expect("test response");
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("test listener failed: {error}"),
                }
            }
            requests
        });
        let client = create_client().expect("native client");
        let result =
            tauri::async_runtime::block_on(post_payload_to(&client, &endpoint, &json!({})));
        assert!(result.is_err());
        assert_eq!(server.join().expect("test server"), 1);
    }
}
