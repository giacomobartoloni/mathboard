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

fn main() {
    let out = std::env::var("OUT_DIR").expect("Cargo output directory");
    let status = std::process::Command::new("node")
        .arg("../tools/generate-mcp-discovery.mjs")
        .arg(&out)
        .current_dir(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .status().expect("Node 22 is needed to derive MCP discovery from F033");
    assert!(status.success(), "MCP discovery generation failed");
    println!("cargo:rerun-if-changed=../tools/generate-mcp-discovery.mjs");
    println!("cargo:rerun-if-changed=../dev-agent/command-contract.js");
    println!("cargo:rerun-if-changed=../src/board/agent/command-registry.js");
    println!("cargo:rerun-if-changed=../src/board/objects/constants.js");
    println!("cargo:rerun-if-changed=../src/board/capture/discovery.js");
    println!("cargo:rerun-if-changed=../src/board/capture/contract.js");
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "track_desktop_analytics",
            "board_bridge_state",
            "board_bridge_reply",
            "mcp_permission_status",
            "mcp_set_enabled",
            "mcp_grant_read",
            "mcp_grant_screenshot",
            "mcp_revoke_all",
        ]),
    ))
    .expect("Tauri build configuration failed");
}
