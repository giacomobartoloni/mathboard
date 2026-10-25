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

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{Map, Value, json};
use tauri::Manager;

const EVENTS_ENDPOINT: &str = "https://queue.simpleanalyticscdn.com/events";
const ANALYTICS_HOSTNAME: &str = "mathboard.app";
const DESKTOP_USER_AGENT: &str = "MathBoardDesktop/1.0 (+https://mathboard.app/)";
static HTTP_CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();

fn allowed_event(name: &str) -> bool {
    matches!(
        name,
        "board_engaged"
            | "object_created"
            | "text_tool_selected"
            | "text_creation_started"
            | "text_creation_cancelled"
            | "text_edit_started"
            | "text_edited"
            | "formula_tool_selected"
            | "formula_modal_opened"
            | "formula_assist_used"
            | "formula_submitted"
            | "formula_edited"
            | "formula_modal_cancelled"
            | "formula_render_failed"
            | "stamp_share_created"
            | "stamp_share_copied"
            | "stamp_share_opened"
            | "stamp_share_failed"
            | "object_deleted"
            | "undo_used"
            | "redo_used"
            | "theme_changed"
            | "fullscreen_entered"
            | "fullscreen_exited"
            | "support_opened"
            | "usage_milestone"
            | "external_link_opened"
            | "document_saved"
            | "document_opened"
            | "document_exported"
    )
}

// This is an explicit category/count allowlist, not a generic event payload relay.
fn safe_metadata(metadata: Map<String, Value>) -> Map<String, Value> {
    let mut safe = Map::new();
    for (key, value) in metadata {
        let sanitized = match key.as_str() {
            "object_type" | "shape" | "command_type" | "theme" | "mode" | "source" | "group"
            | "reason" | "stage" => value.as_str().and_then(|category| {
                if !category.is_empty()
                    && category.len() <= 48
                    && category
                        .bytes()
                        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
                {
                    Some(Value::String(category.to_owned()))
                } else {
                    None
                }
            }),
            "actions" | "selection_count" | "path_count" | "shape_count" | "text_count"
            | "formula_count" | "group_count" | "unknown_count" => value
                .as_u64()
                .filter(|count| *count <= 1_000_000)
                .map(Value::from),
            _ => None,
        };
        if let Some(sanitized) = sanitized {
            safe.insert(key, sanitized);
        }
    }
    safe
}

#[tauri::command]
pub(crate) async fn track_desktop_analytics(
    app: tauri::AppHandle,
    event: String,
    metadata: Map<String, Value>,
) -> Result<(), String> {
    if !allowed_event(&event) {
        return Err("Unsupported analytics event".into());
    }

    let mut metadata = safe_metadata(metadata);
    metadata.insert("runtime".into(), Value::String("desktop".into()));
    metadata.insert(
        "app_version".into(),
        Value::String(app.package_info().version.to_string()),
    );
    // Deliberately omit IP, device identifiers, board content, referrer and URL.
    let payload = json!({
        "type": "event",
        "hostname": ANALYTICS_HOSTNAME,
        "path": "/",
        "event": event,
        "ua": DESKTOP_USER_AGENT,
        "metadata": metadata,
    });

    let client = HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .ok()
    });
    let client = client
        .as_ref()
        .ok_or_else(|| "Analytics transport unavailable".to_string())?;

    let response = client
        .post(EVENTS_ENDPOINT)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(payload.to_string())
        .send()
        .await
        .map_err(|_| "Analytics request failed".to_string())?;

    if !response.status().is_success() {
        return Err("Analytics provider rejected event".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_arbitrary_event_names() {
        assert!(allowed_event("object_created"));
        assert!(!allowed_event("board_hello_from_user"));
    }

    #[test]
    fn drops_user_content_and_identifiers() {
        let given = json!({
            "object_type": "formula",
            "selection_count": 0,
            "board_text": "private note",
            "latex": "x^2",
            "user_id": "abc123",
            "runtime": "spoofed",
            "app_version": "spoofed",
            "theme": "dark",
            "stage": "not safe value",
            "unknown_count": -1
        });
        let filtered = safe_metadata(given.as_object().unwrap().clone());
        assert_eq!(filtered, json!({
            "object_type": "formula",
            "selection_count": 0,
            "theme": "dark"
        }).as_object().unwrap().clone());
    }
}
