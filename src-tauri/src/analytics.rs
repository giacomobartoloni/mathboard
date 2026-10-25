// MathBoard
//
// Copyright (C) 2026 Giacomo Bartoloni
//
// Licensed under the GNU Affero General Public License v3.0 or later.

use std::sync::LazyLock;
use std::time::Duration;

use serde_json::{Map, Value};

const MAX_EVENT_LENGTH: usize = 200;
const MAX_METADATA_FIELDS: usize = 24;
const MAX_METADATA_KEY_LENGTH: usize = 64;
const MAX_METADATA_STRING_LENGTH: usize = 1000;
const SIMPLE_ANALYTICS_ENDPOINT: &str = "https://queue.simpleanalyticscdn.com/events";

static HTTP_CLIENT: LazyLock<Result<reqwest::Client, reqwest::Error>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
});

fn is_valid_event(event: &str, metadata: &Map<String, Value>) -> bool {
    !event.is_empty()
        && event.len() <= MAX_EVENT_LENGTH
        && event
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        && metadata.len() <= MAX_METADATA_FIELDS
        && metadata.keys().all(|key| {
            !key.is_empty()
                && key.len() <= MAX_METADATA_KEY_LENGTH
                && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        })
        && metadata.values().all(|value| match value {
            Value::String(text) => text.len() <= MAX_METADATA_STRING_LENGTH,
            Value::Number(number) => number.as_f64().is_some_and(f64::is_finite),
            Value::Bool(_) => true,
            _ => false,
        })
        && metadata.get("runtime").and_then(Value::as_str) == Some("desktop")
}

// A fixed destination and bounded flat primitives prevent arbitrary remote requests.
// Only allow bounded semantic analytics payloads; never accept URLs or endpoints from JS.
#[tauri::command]
pub(crate) async fn track_desktop_analytics_event(
    event: String,
    metadata: serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    if !is_valid_event(&event, &metadata) {
        return Err("Invalid analytics event".into());
    }

    let client = match &*HTTP_CLIENT {
        Ok(client) => client,
        Err(_) => return Err("Analytics unavailable".into()),
    };
    let payload = serde_json::json!({
        "type": "event",
        "hostname": "mathboard.app",
        "event": event,
        "path": "/",
        "ua": "MathBoardDesktop/1.0 (+https://mathboard.app/)",
        "metadata": metadata,
    });
    client
        .post(SIMPLE_ANALYTICS_ENDPOINT)
        .json(&payload)
        .send()
        .await
        .map_err(|_| "Analytics unavailable".to_string())?
        .error_for_status()
        .map_err(|_| "Analytics unavailable".to_string())?;
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::{is_valid_event, Map, Value};
    use serde_json::json;

    fn base_metadata() -> Map<String, Value> {
        serde_json::from_value(json!({
            "runtime": "desktop",
            "app_version": "1.8.0",
            "object_type": "formula"
        }))
        .expect("test metadata")
    }

    #[test]
    fn accepts_bounded_semantic_events() {
        assert!(is_valid_event("object_created", &base_metadata()));
    }

    #[test]
    fn rejects_invalid_event_names() {
        assert!(!is_valid_event("object-created", &base_metadata()));
        assert!(!is_valid_event("", &base_metadata()));
    }

    #[test]
    fn rejects_nested_metadata_and_missing_runtime() {
        let mut metadata = base_metadata();
        metadata.insert("canvas".into(), json!({"text": "secret"}));
        assert!(!is_valid_event("object_created", &metadata));

        metadata.remove("canvas");
        metadata.remove("runtime");
        assert!(!is_valid_event("object_created", &metadata));
    }
}
