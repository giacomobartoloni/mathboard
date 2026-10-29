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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

use tauri::Manager;

pub const MENU_ID: &str = "mathboard-mcp-settings";
pub const WINDOW_LABEL: &str = "mcp-settings";

/// The native OS menu is the only entrypoint. No board component opens this window.
pub fn open_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        tauri::WebviewUrl::App("desktop/mcp-settings.html".into()),
    )
    .title("Local MCP settings — MathBoard")
    .inner_size(580.0, 680.0)
    .min_inner_size(480.0, 520.0)
    .resizable(true)
    .build()?;
    Ok(())
}
