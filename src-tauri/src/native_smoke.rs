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

//! Feature-only native smoke driver; never writes board payloads or screenshot bytes
//! to the report and refuses to modify the normal application profile.

use crate::board_bridge::{BoardReply, BoardRequestBroker, BrokerError, emit_request};
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const SMOKE_APP_ID: &str = "app.mathboard.desktop.phasecsmoke";

fn request(app: &tauri::AppHandle, method: &str, params: Value) -> Result<Value, String> {
    let broker = app.state::<BoardRequestBroker>();
    let board_id = broker.active_board_id().ok_or("native board not ready")?;
    let (id, receiver) = emit_request(app, &broker, &board_id, method, params)
        .map_err(|error| format!("native {method} queue: {error:?}"))?;
    match broker.await_reply(&id, receiver, Duration::from_secs(10)) {
        Ok(BoardReply::Success(value)) => Ok(value),
        Ok(BoardReply::Failure { code, .. }) => Err(format!("native {method} error: {code}")),
        Ok(BoardReply::Disconnected) => Err(format!("native {method} disconnected")),
        Ok(BoardReply::TimedOut) | Err(BrokerError::Timeout) => {
            Err(format!("native {method} timeout / outcome unknown"))
        }
        Ok(BoardReply::ExecutionUnknown) | Err(BrokerError::ExecutionUnknown) => Err(format!(
            "native {method} execution unknown; read back board state"
        )),
        Err(error) => Err(format!("native {method} transport: {error:?}")),
    }
}

fn object_count(observation: &Value) -> Result<usize, String> {
    observation["objects"]
        .as_array()
        .map(Vec::len)
        .ok_or_else(|| "observe returned no objects array".to_owned())
}

fn run(app: &tauri::AppHandle) -> Result<Value, String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    let initial = loop {
        match request(app, "observe", json!({})) {
            Ok(value) if value["stable"] == true => break value,
            Ok(_) | Err(_) if Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(150));
            }
            Ok(_) => return Err("board never became stable".into()),
            Err(error) => return Err(format!("board never became ready: {error}")),
        }
    };
    let before = object_count(&initial)?;
    let created = request(
        app,
        "create",
        json!({
            "spec": {"type": "rect", "width": 36, "height": 24, "left": 80, "top": 80},
            "options": {"select": false}
        }),
    )?;
    let id = created["id"].as_str().ok_or("create returned no ID")?;
    let measure = request(app, "measure", json!({"id": id}))?;
    if measure["width"].as_f64().unwrap_or(0.0) <= 0.0 {
        return Err("native measure returned an invalid width".into());
    }
    let batch = request(
        app,
        "createMany",
        json!({
            "specs": [
                {"type": "rect", "width": 26, "height": 22, "left": 140, "top": 80},
                {"type": "rect", "width": 22, "height": 26, "left": 190, "top": 80}
            ],
            "options": {"select": false}
        }),
    )?;
    if batch.as_array().map(Vec::len) != Some(2) {
        return Err("createMany did not return exactly two objects".into());
    }
    if object_count(&request(app, "observe", json!({}))?)? != before + 3 {
        return Err("native observe did not see committed create/createMany objects".into());
    }
    let screenshot = request(
        app,
        "screenshot",
        json!({
            "target": {"kind": "viewport"}, "scale": 0.5
        }),
    )?;
    if screenshot["mimeType"] != "image/png"
        || screenshot["encoding"] != "base64"
        || !screenshot["data"]
            .as_str()
            .is_some_and(|s| s.starts_with("iVBORw0KGgo"))
    {
        return Err("native screenshot did not return a valid PNG signature".into());
    }
    // The existing production native menu Undo event has no correlated reply.
    // Poll a new observation to assert that a two-object batch takes one Undo.
    app.emit_to("main", "mathboard-native-menu", "undo")
        .map_err(|_| "unable to dispatch native Undo".to_string())?;
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if object_count(&request(app, "observe", json!({}))?)? == before + 1 {
            break;
        }
        if Instant::now() >= deadline {
            return Err("native Undo did not revert createMany in one step".into());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(json!({
        "status": "passed",
        "profile": SMOKE_APP_ID,
        "checks": [
            "native-observe", "native-create", "native-createMany",
            "native-measure", "native-screenshot-png", "native-undo-batch"
        ]
    }))
}

pub fn install(app: tauri::AppHandle) {
    let Some(path) = std::env::var_os("MATHBOARD_PHASE_C_SMOKE_REPORT").map(PathBuf::from) else {
        return;
    };
    thread::spawn(move || {
        let outcome = if app.config().identifier == SMOKE_APP_ID {
            run(&app)
        } else {
            Err("refusing to mutate a non-isolated MathBoard profile".to_owned())
        };
        let success = outcome.is_ok();
        let report = match outcome {
            Ok(value) => value,
            Err(error) => json!({"status": "failed", "reason": error}),
        };
        if let Ok(body) = serde_json::to_vec_pretty(&report) {
            let _ = fs::write(path, body);
        }
        app.exit(if success { 0 } else { 1 });
    });
}
