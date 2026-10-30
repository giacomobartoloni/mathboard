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
pub mod mcp_contract;
mod mcp_http;
pub mod mcp_ipc_client;
pub mod mcp_ipc_protocol;
#[cfg(unix)]
pub mod mcp_ipc_unix;
pub mod mcp_native;
pub mod mcp_server;
mod mcp_settings;

#[cfg(feature = "phase-c-verification")]
pub mod ipc_probe;
#[cfg(feature = "phase-c-verification")]
mod native_smoke;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let enable_http_at_start = companion::http_startup_requested();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(board_bridge::BoardRequestBroker::new(
            &uuid::Uuid::new_v4().to_string(),
        ))
        .invoke_handler(tauri::generate_handler![
            analytics::track_desktop_analytics,
            board_bridge::board_bridge_state,
            board_bridge::board_bridge_reply,
            board_bridge::mcp_permission_status,
            board_bridge::mcp_set_enabled,
        ]);

    let builder = builder.setup(move |app| {
        use tauri::Manager;
        // Unless explicitly requested by the CLI, no socket is bound at startup.
        app.manage(mcp_http::LocalMcpHttpServer::new(app.handle().clone()));
        if enable_http_at_start {
            let broker = app.state::<board_bridge::BoardRequestBroker>();
            let server = app.state::<mcp_http::LocalMcpHttpServer>();
            let startup = (|| -> std::io::Result<()> {
                // Refuse Windows GUI startup when stdout would silently discard the token.
                companion::ensure_http_startup_stdout()?;
                // Reuse the same transport, ephemeral token and permission gate as native On.
                server.set_enabled(&broker, true)?;
                let token = server
                    .token()
                    .ok_or_else(|| std::io::Error::other("MCP HTTP startup token unavailable"))?;
                let mut output = std::io::stdout().lock();
                companion::write_http_startup_record(&mut output, &token)
            })();
            if let Err(error) = startup {
                // If the token cannot be returned, never leave a writable listener behind.
                let _ = server.shutdown(&broker);
                // Tauri panics when setup returns Err on macOS. This opt-in CLI
                // startup must instead fail cleanly with a nonzero exit code.
                companion::exit_http_startup_failure(&error);
            }
        }
        #[cfg(feature = "phase-c-verification")]
        {
            if std::env::var_os("MATHBOARD_PHASE_C_IPC_PROBE").is_some() {
                #[cfg(any(unix, windows))]
                app.manage(ipc_probe::ProbeServer::start()?);
            }
            native_smoke::install(app.handle().clone());
        }
        Ok(())
    });

    // Native menu owns the local MCP settings. The shared board WebView has no
    // configuration entrypoint or permission-changing capabilities.
    let builder = builder
        .menu(|handle| {
            use tauri::menu::{Menu, MenuItem, Submenu};

            let menu = Menu::default(handle)?;
            // Preserve the existing macOS board Undo/Redo menu overrides.
            #[cfg(target_os = "macos")]
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

            let settings = MenuItem::with_id(
                handle,
                mcp_settings::MENU_ID,
                "Local MCP settings…",
                true,
                None::<&str>,
            )?;
            let assistants = Submenu::with_items(handle, "Local assistants", true, &[&settings])?;
            menu.append(&assistants)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == mcp_settings::MENU_ID {
                let handle = app.clone();
                // Windows WebView2 can deadlock if created in the synchronous
                // menu event callback. The builder marshals work to the UI thread.
                std::thread::spawn(move || {
                    if mcp_settings::open_window(&handle).is_err() {
                        eprintln!("Unable to open local MCP settings window.");
                    }
                });
                return;
            }

            #[cfg(target_os = "macos")]
            {
                use tauri::Emitter;

                let command = if event.id() == "mathboard-undo" {
                    "undo"
                } else if event.id() == "mathboard-redo" {
                    "redo"
                } else {
                    return;
                };
                if app
                    .emit_to("main", "mathboard-native-menu", command)
                    .is_err()
                {
                    eprintln!("Failed to deliver desktop menu action.");
                }
            }
        });

    // App::run exits the process directly, so managed server state needs an exit hook.
    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                let broker = app.state::<board_bridge::BoardRequestBroker>();
                if let Some(server) = app.try_state::<mcp_http::LocalMcpHttpServer>() {
                    let _ = server.shutdown(&broker);
                } else {
                    broker.mcp_set_enabled(false);
                }
                #[cfg(feature = "phase-c-verification")]
                {
                    #[cfg(any(unix, windows))]
                    {
                        use tauri::Manager;
                        if let Some(server) = app.try_state::<ipc_probe::ProbeServer>() {
                            server.shutdown();
                        }
                    }
                }
            }
        });
}
