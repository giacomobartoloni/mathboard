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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
// Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

#![cfg(all(feature = "phase-c-verification", windows))]

use app_lib::ipc_probe::ProbeServer;
use std::process::{Command, Output, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

// These tests intentionally use the real per-user endpoint and an actual
// companion process; serialize them to avoid competing for the same endpoint.
static ENDPOINT: Mutex<()> = Mutex::new(());

fn companion() -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_mathboard"))
        .arg("--mathboard-companion-ping")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let start = Instant::now();
    while child.try_wait().unwrap().is_none() && start.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(10));
    }
    if child.try_wait().unwrap().is_none() {
        child.kill().unwrap();
        panic!("companion did not exit within the native deadline");
    }
    child.wait_with_output().unwrap()
}

#[test]
fn installed_style_companion_round_trip_and_closed_app_failure() {
    let _serial = ENDPOINT.lock().unwrap();
    let server = ProbeServer::start().expect("start the current user's private pipe");
    for _ in 0..3 {
        let output = companion();
        assert!(output.status.success(), "{output:?}");
        assert_eq!(output.stdout, b"mathboard-companion pong\n");
    }
    server.shutdown();
    let output = companion();
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
}

#[test]
fn duplicate_server_is_rejected_without_disrupting_the_original() {
    let _serial = ENDPOINT.lock().unwrap();
    let server = ProbeServer::start().unwrap();
    assert!(ProbeServer::start().is_err());
    assert!(companion().status.success());
    server.shutdown();
}

#[test]
fn explicit_shutdown_and_old_drop_do_not_disconnect_a_restarted_server() {
    let _serial = ENDPOINT.lock().unwrap();
    let first = ProbeServer::start().unwrap();
    first.shutdown();
    first.shutdown();
    let next = ProbeServer::start().unwrap();
    drop(first);
    assert!(companion().status.success());
    next.shutdown();
    assert_eq!(companion().status.code(), Some(1));
}
