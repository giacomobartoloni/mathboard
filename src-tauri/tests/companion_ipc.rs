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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

#![cfg(all(feature = "phase-c-verification", unix))]

use app_lib::ipc_probe::ProbeServer;
use std::process::Command;

#[test]
fn companion_process_can_ping_same_user_unix_socket() {
    let server = ProbeServer::start().expect("start private per-user IPC probe");
    let result = Command::new(env!("CARGO_BIN_EXE_mathboard"))
        .arg("--mathboard-companion-ping")
        .output()
        .expect("launch companion subprocess");
    assert!(result.status.success(), "{result:?}");
    assert_eq!(result.stdout, b"mathboard-companion pong\n");
    drop(server);
}
