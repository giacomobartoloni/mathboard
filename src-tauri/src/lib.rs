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

mod analytics;
pub mod board_bridge;
pub mod companion;

#[cfg(feature = "phase-c-verification")]
pub mod ipc_probe;
#[cfg(feature = "phase-c-verification")]
mod native_smoke;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(board_bridge::BoardRequestBroker::new(
            &uuid::Uuid::new_v4().to_string(),
        ))
        .invoke_handler(tauri::generate_handler![
            analytics::track_desktop_analytics,
            board_bridge::board_bridge_state,
            board_bridge::board_bridge_reply,
        ]);

    #[cfg(feature = "phase-c-verification")]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        if std::env::var_os("MATHBOARD_PHASE_C_IPC_PROBE").is_some() {
            #[cfg(any(unix, windows))]
            app.manage(ipc_probe::ProbeServer::start()?);
        }
        native_smoke::install(app.handle().clone());
        Ok(())
    });

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
                            &MenuItem::with_id(
                                handle,
                                "mathboard-undo",
                                "Undo",
                                true,
                                None::<&str>,
                            )?,
                            0,
                        )?;
                        edit.insert(
                            &MenuItem::with_id(
                                handle,
                                "mathboard-redo",
                                "Redo",
                                true,
                                None::<&str>,
                            )?,
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

    // Verification builds need an explicit exit hook: App::run exits the process
    // directly, so managed state is not guaranteed to reach Drop.
    #[cfg(feature = "phase-c-verification")]
    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                #[cfg(any(unix, windows))]
                {
                    use tauri::Manager;
                    if let Some(server) = app.try_state::<ipc_probe::ProbeServer>() {
                        server.shutdown();
                    }
                }
            }
        });

    #[cfg(not(feature = "phase-c-verification"))]
    builder
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
