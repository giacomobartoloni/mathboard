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

// Only allow bounded semantic analytics payloads; never accept URLs or endpoints from JS.
#[tauri::command]
async fn track_desktop_analytics_event(
    event: String,
    metadata: serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    if event.is_empty()
        || event.len() > 200
        || !event.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        || metadata.len() > 24
        || metadata.keys().any(|key| {
            key.is_empty()
                || key.len() > 64
                || !key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        })
        || metadata.values().any(|value| match value {
            serde_json::Value::String(text) => text.len() > 1000,
            serde_json::Value::Number(number) => {
                number.as_f64().is_none_or(|value| !value.is_finite())
            }
            serde_json::Value::Bool(_) => false,
            _ => true,
        })
        || metadata.get("runtime").and_then(|value| value.as_str()) != Some("desktop")
    {
        return Err("Invalid analytics event".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|_| "Analytics unavailable".to_string())?;
    let payload = serde_json::json!({
        "type": "event",
        "hostname": "mathboard.app",
        "event": event,
        "path": "/",
        "ua": "MathBoardDesktop/1.0 (+https://mathboard.app/)",
        "metadata": metadata,
    });
    client
        .post("https://queue.simpleanalyticscdn.com/events")
        .json(&payload)
        .send()
        .await
        .map_err(|_| "Analytics unavailable".to_string())?
        .error_for_status()
        .map_err(|_| "Analytics unavailable".to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    // Keep Tauri's default macOS menus, replacing only text-input Undo/Redo
    // with actions dispatched to MathBoard's existing board command log.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|handle| {
            use tauri::menu::{Menu, MenuItem};

            let menu = Menu::default(handle)?;
            for item in menu.items()? {
                if let Some(edit) = item.as_submenu() {
                    if edit.text()? == "Edit" {
                        edit.remove_at(0)?;
                        edit.remove_at(0)?;
                        edit.insert(
                            &MenuItem::with_id(handle, "mathboard-undo", "Undo", true, None::<&str>)?,
                            0,
                        )?;
                        edit.insert(
                            &MenuItem::with_id(handle, "mathboard-redo", "Redo", true, None::<&str>)?,
                            1,
                        )?;
                        break;
                    }
                }
            }
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            use tauri::Emitter;

            let command = if event.id() == "mathboard-undo" {
                "undo"
            } else if event.id() == "mathboard-redo" {
                "redo"
            } else {
                return;
            };
            if let Err(error) = app.emit_to("main", "mathboard-native-menu", command) {
                eprintln!("Failed to deliver desktop menu action: {error}");
            }
        });

    builder
        .invoke_handler(tauri::generate_handler![track_desktop_analytics_event])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
