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

fn fields(metadata: &Map<String, Value>, allowed: &[&str], required: &[&str]) -> bool {
    metadata.len() <= allowed.len()
        && metadata.keys().all(|key| allowed.contains(&key.as_str()))
        && required.iter().all(|key| metadata.contains_key(*key))
}

fn category(metadata: &Map<String, Value>, key: &str, allowed: &[&str]) -> bool {
    metadata
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|value| allowed.contains(&value))
}

fn count(metadata: &Map<String, Value>, key: &str, minimum: u64, maximum: u64) -> Option<u64> {
    metadata
        .get(key)
        .and_then(Value::as_u64)
        .filter(|value| (minimum..=maximum).contains(value))
}

fn valid_creation(metadata: &Map<String, Value>) -> bool {
    const TYPES: &[&str] = &[
        "path",
        "shape",
        "text",
        "formula",
        "group",
        "unknown",
        "mixed",
        "stamp",
        "stamp_template",
    ];
    fields(metadata, &["object_type", "shape"], &["object_type"])
        && category(metadata, "object_type", TYPES)
        && match metadata.get("shape") {
            None => true,
            Some(_) => {
                metadata.get("object_type").and_then(Value::as_str) == Some("shape")
                    && category(metadata, "shape", &["rectangle", "circle", "arrow"])
            }
        }
}

fn valid_deletion(metadata: &Map<String, Value>) -> bool {
    const COUNTS: [(&str, &str); 6] = [
        ("path_count", "path"),
        ("shape_count", "shape"),
        ("text_count", "text"),
        ("formula_count", "formula"),
        ("group_count", "group"),
        ("unknown_count", "unknown"),
    ];
    const REQUIRED: &[&str] = &[
        "object_type",
        "selection_count",
        "path_count",
        "shape_count",
        "text_count",
        "formula_count",
        "group_count",
        "unknown_count",
    ];
    if !fields(metadata, REQUIRED, REQUIRED) {
        return false;
    }
    let Some(selection_count) = count(metadata, "selection_count", 1, 10_000) else {
        return false;
    };
    let mut total = 0;
    let mut present = None;
    let mut mixed = false;
    for (key, kind) in COUNTS {
        let Some(value) = count(metadata, key, 0, 10_000) else {
            return false;
        };
        total += value;
        if value > 0 {
            if present.is_some() {
                mixed = true;
            } else {
                present = Some(kind);
            }
        }
    }
    let expected_type = if mixed { Some("mixed") } else { present };
    total == selection_count && metadata.get("object_type").and_then(Value::as_str) == expected_type
}

fn valid_assist(metadata: &Map<String, Value>) -> bool {
    if !fields(metadata, &["mode", "source", "group"], &["mode", "source"])
        || !category(metadata, "mode", &["create", "edit"])
    {
        return false;
    }
    match metadata.get("source").and_then(Value::as_str) {
        Some("quick_insert") => !metadata.contains_key("group"),
        Some("palette") => category(metadata, "group", &["symbols", "greek", "relations"]),
        _ => false,
    }
}

fn validate_event(name: &str, metadata: &Map<String, Value>) -> Result<(), &'static str> {
    let valid = match name {
        "object_created" => valid_creation(metadata),
        "object_deleted" => valid_deletion(metadata),
        "formula_modal_opened" | "formula_submitted" | "formula_render_failed" => {
            fields(metadata, &["mode"], &["mode"])
                && category(metadata, "mode", &["create", "edit"])
        }
        "formula_modal_cancelled" => {
            fields(metadata, &["mode", "reason"], &["mode", "reason"])
                && category(metadata, "mode", &["create", "edit"])
                && category(
                    metadata,
                    "reason",
                    &["cancel_button", "close_button", "backdrop", "escape"],
                )
        }
        "formula_assist_used" => valid_assist(metadata),
        "stamp_share_failed" => {
            fields(metadata, &["stage"], &["stage"])
                && category(
                    metadata,
                    "stage",
                    &["export_selection", "build_url", "copy", "open"],
                )
        }
        "undo_used" | "redo_used" => {
            fields(metadata, &["command_type"], &["command_type"])
                && category(
                    metadata,
                    "command_type",
                    &[
                        "add",
                        "batch-add",
                        "modify",
                        "replace",
                        "delete",
                        "duplicate",
                        "group",
                        "ungroup",
                        "recolor",
                    ],
                )
        }
        "theme_changed" => {
            fields(metadata, &["theme"], &["theme"])
                && category(metadata, "theme", &["light", "dark", "chalkboard"])
        }
        "usage_milestone" => {
            fields(metadata, &["actions"], &["actions"])
                && matches!(count(metadata, "actions", 5, 50), Some(5 | 20 | 50))
        }
        "board_engaged"
        | "text_tool_selected"
        | "text_creation_started"
        | "text_creation_cancelled"
        | "text_edit_started"
        | "text_edited"
        | "formula_tool_selected"
        | "formula_edited"
        | "stamp_share_created"
        | "stamp_share_copied"
        | "stamp_share_opened"
        | "fullscreen_entered"
        | "fullscreen_exited"
        | "support_opened"
        | "external_link_opened"
        | "document_saved"
        | "document_opened"
        | "document_exported" => metadata.is_empty(),
        _ => false,
    };
    valid.then_some(()).ok_or("invalid analytics event")
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
    validate_event(&event, &metadata).map_err(|_| "Invalid analytics event".to_string())?;
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
    use std::process::Command;
    use std::sync::{Arc, Barrier};
    use std::thread;
    use std::time::{Duration, Instant};

    fn metadata(value: Value) -> Map<String, Value> {
        value.as_object().expect("object fixture").clone()
    }

    #[test]
    fn accepts_a_known_creation_with_approved_shape() {
        assert!(
            validate_event(
                "object_created",
                &metadata(json!({
                    "object_type": "shape",
                    "shape": "rectangle"
                }))
            )
            .is_ok()
        );
    }

    #[test]
    fn accepts_a_known_event_without_metadata() {
        assert!(validate_event("board_engaged", &metadata(json!({}))).is_ok());
    }

    #[test]
    fn creation_accepts_semantic_roots_and_rejects_content_shaped_categories() {
        for kind in [
            "path",
            "shape",
            "text",
            "formula",
            "group",
            "unknown",
            "mixed",
            "stamp",
            "stamp_template",
        ] {
            assert!(
                validate_event("object_created", &metadata(json!({ "object_type": kind }))).is_ok(),
                "{kind}"
            );
        }
        for shape in ["rectangle", "circle", "arrow"] {
            assert!(
                validate_event(
                    "object_created",
                    &metadata(json!({ "object_type": "shape", "shape": shape }))
                )
                .is_ok(),
                "{shape}"
            );
        }
        for rejected in [
            json!({ "object_type": "private_note" }),
            json!({ "object_type": "formula", "shape": "circle" }),
            json!({ "object_type": "shape", "shape": "private_note" }),
            json!({ "object_type": "shape", "latex": "x^2" }),
            json!({ "object_type": "shape", "runtime": "web" }),
            json!({ "object_type": "shape", "app_version": "spoofed" }),
        ] {
            assert!(validate_event("object_created", &metadata(rejected)).is_err());
        }
    }

    #[test]
    fn deletion_requires_complete_bounded_counts_and_consistent_type() {
        let mixed = json!({
            "selection_count": 2, "object_type": "mixed", "path_count": 1,
            "shape_count": 0, "text_count": 0, "formula_count": 1,
            "group_count": 0, "unknown_count": 0
        });
        assert!(validate_event("object_deleted", &metadata(mixed.clone())).is_ok());
        let homogeneous = json!({
            "selection_count": 2, "object_type": "path", "path_count": 2,
            "shape_count": 0, "text_count": 0, "formula_count": 0,
            "group_count": 0, "unknown_count": 0
        });
        assert!(validate_event("object_deleted", &metadata(homogeneous)).is_ok());
        for (key, value) in [
            ("selection_count", json!(0)),
            ("selection_count", json!(10001)),
            ("selection_count", json!(3)),
            ("object_type", json!("formula")),
            ("path_count", json!(-1)),
            ("path_count", json!("1")),
        ] {
            let mut invalid = mixed.clone();
            invalid[key] = value;
            assert!(
                validate_event("object_deleted", &metadata(invalid)).is_err(),
                "{key}"
            );
        }
        let mut missing = metadata(mixed);
        missing.remove("unknown_count");
        assert!(validate_event("object_deleted", &missing).is_err());
    }

    #[test]
    fn formula_metadata_is_closed_by_event_and_assist_source() {
        for name in [
            "formula_modal_opened",
            "formula_submitted",
            "formula_render_failed",
        ] {
            assert!(
                validate_event(name, &metadata(json!({ "mode": "create" }))).is_ok(),
                "{name}"
            );
            assert!(
                validate_event(name, &metadata(json!({ "mode": "private_note" }))).is_err(),
                "{name}"
            );
        }
        assert!(
            validate_event(
                "formula_modal_cancelled",
                &metadata(json!({ "mode": "edit", "reason": "escape" }))
            )
            .is_ok()
        );
        assert!(
            validate_event(
                "formula_assist_used",
                &metadata(json!({ "mode": "create", "source": "quick_insert" }))
            )
            .is_ok()
        );
        assert!(
            validate_event(
                "formula_assist_used",
                &metadata(json!({ "mode": "edit", "source": "palette", "group": "greek" }))
            )
            .is_ok()
        );
        assert!(
            validate_event(
                "formula_assist_used",
                &metadata(json!({ "mode": "edit", "source": "quick_insert", "group": "greek" }))
            )
            .is_err()
        );
        assert!(
            validate_event(
                "formula_assist_used",
                &metadata(json!({ "mode": "edit", "source": "palette" }))
            )
            .is_err()
        );
        assert!(
            validate_event(
                "formula_modal_cancelled",
                &metadata(json!({ "mode": "edit", "reason": "private_note" }))
            )
            .is_err()
        );
    }

    #[test]
    fn other_metadata_families_reject_wrong_values_and_keys() {
        assert!(
            validate_event("stamp_share_failed", &metadata(json!({ "stage": "copy" }))).is_ok()
        );
        assert!(
            validate_event("theme_changed", &metadata(json!({ "theme": "chalkboard" }))).is_ok()
        );
        assert!(
            validate_event(
                "undo_used",
                &metadata(json!({ "command_type": "batch-add" }))
            )
            .is_ok()
        );
        assert!(
            validate_event("redo_used", &metadata(json!({ "command_type": "recolor" }))).is_ok()
        );
        for count in [5, 20, 50] {
            assert!(
                validate_event("usage_milestone", &metadata(json!({ "actions": count }))).is_ok()
            );
        }
        for (name, bad) in [
            ("stamp_share_failed", json!({ "stage": "private_note" })),
            ("theme_changed", json!({ "theme": "private_note" })),
            ("undo_used", json!({ "command_type": "private_note" })),
            ("usage_milestone", json!({ "actions": 6 })),
            ("board_engaged", json!({ "board_text": "private note" })),
        ] {
            assert!(validate_event(name, &metadata(bad)).is_err(), "{name}");
        }
        assert!(validate_event("custom_user_event", &metadata(json!({}))).is_err());
    }

    #[test]
    fn native_policy_accepts_the_actual_js_event_catalog() {
        let output = Command::new("node")
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .args([
                "--input-type=module", "-e",
                "import { ANALYTICS_EVENTS } from '../src/analytics/events.js'; console.log(JSON.stringify(Object.values(ANALYTICS_EVENTS)))",
            ])
            .output()
            .expect("Node.js is required by this repository");
        assert!(output.status.success());
        let names: Vec<String> =
            serde_json::from_slice(&output.stdout).expect("analytics event names");
        assert_eq!(names.len(), 30);
        for name in names {
            let sample = match name.as_str() {
                "object_created" => json!({ "object_type": "formula" }),
                "object_deleted" => json!({
                    "selection_count": 1, "object_type": "formula", "path_count": 0,
                    "shape_count": 0, "text_count": 0, "formula_count": 1,
                    "group_count": 0, "unknown_count": 0
                }),
                "formula_modal_opened" | "formula_submitted" | "formula_render_failed" => {
                    json!({ "mode": "create" })
                }
                "formula_modal_cancelled" => json!({ "mode": "create", "reason": "escape" }),
                "formula_assist_used" => json!({ "mode": "create", "source": "quick_insert" }),
                "stamp_share_failed" => json!({ "stage": "copy" }),
                "undo_used" | "redo_used" => json!({ "command_type": "add" }),
                "theme_changed" => json!({ "theme": "light" }),
                "usage_milestone" => json!({ "actions": 5 }),
                _ => json!({}),
            };
            assert!(validate_event(&name, &metadata(sample)).is_ok(), "{name}");
        }
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
    fn native_http_request_contains_only_approved_event_fields() {
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
        validate_event("object_created", &event_metadata).expect("approved event");
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
            let deadline = Instant::now() + Duration::from_secs(1);
            let mut requests = 0;
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        let mut request = [0_u8; 2048];
                        let _ = stream.read(&mut request);
                        requests += 1;
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
