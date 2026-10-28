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
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, mpsc};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

pub const SCHEMA_VERSION: u32 = 2;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_REPLY_BYTES: usize = 7 * 1024 * 1024;
const MAX_PENDING: usize = 16;
const METHODS: &[&str] = &[
    "observe",
    "measure",
    "screenshot",
    "create",
    "createMany",
    "update",
    "delete",
    "deleteMany",
    "clear",
    "group",
    "layout",
];
const READ_ONLY_METHODS: &[&str] = &["observe", "measure", "screenshot"];

fn valid_board_id(value: &str) -> bool {
    value.len() > 3
        && value.len() <= 131
        && value.starts_with("mb_")
        && value[3..]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[derive(Debug, PartialEq, Eq)]
pub enum BrokerError {
    NotReady,
    UnsupportedMethod,
    RequestTooLarge,
    ReplyTooLarge,
    Busy,
    InvalidReply,
    StaleReply,
    UnknownRequest,
    Timeout,
    InvalidBoardId,
    ExecutionUnknown,
}

#[derive(Debug, PartialEq)]
pub enum BoardReply {
    Success(Value),
    Failure { code: String, message: String },
    Disconnected,
    TimedOut,
    ExecutionUnknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboundRequest {
    pub request_id: String,
    pub app_generation: String,
    pub renderer_generation: String,
    pub board_epoch: u64,
    pub board_id: String,
    pub schema_version: u32,
    pub expires_at_ms: u64,
    pub method: String,
    pub params: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IncomingReply {
    request_id: String,
    app_generation: String,
    renderer_generation: String,
    board_epoch: u64,
    board_id: String,
    schema_version: u32,
    ok: bool,
    result: Option<Value>,
    error: Option<ReplyError>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplyError {
    code: String,
    message: String,
}

struct Pending {
    renderer_generation: String,
    board_epoch: u64,
    board_id: String,
    mutates: bool,
    deadline: Instant,
    sender: mpsc::Sender<BoardReply>,
}

#[derive(Default)]
struct BrokerState {
    renderer_generation: Option<String>,
    board_epoch: u64,
    active_board_id: Option<String>,
    ready: bool,
    pending: HashMap<String, Pending>,
}

/** A one-shot, bounded request registry. It never executes a board operation. */
pub struct BoardRequestBroker {
    app_generation: String,
    next_request: AtomicU64,
    state: Mutex<BrokerState>,
}

impl BoardRequestBroker {
    pub fn new(app_generation: &str) -> Self {
        Self {
            app_generation: app_generation.to_owned(),
            next_request: AtomicU64::new(1),
            state: Mutex::new(BrokerState::default()),
        }
    }

    pub fn app_generation(&self) -> &str {
        &self.app_generation
    }

    pub fn renderer_state(
        &self,
        renderer_generation: &str,
        board_epoch: u64,
        ready: bool,
        active_board_id: Option<&str>,
    ) -> Result<(), BrokerError> {
        if renderer_generation.is_empty()
            || renderer_generation.len() > 128
            || !renderer_generation
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        {
            return Err(BrokerError::InvalidReply);
        }
        if ready && !active_board_id.is_some_and(valid_board_id) {
            return Err(BrokerError::InvalidBoardId);
        }
        if active_board_id.is_some_and(|id| !valid_board_id(id)) {
            return Err(BrokerError::InvalidBoardId);
        }
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if state.renderer_generation.as_deref() == Some(renderer_generation)
            && board_epoch < state.board_epoch
        {
            return Err(BrokerError::StaleReply);
        }
        if state.renderer_generation.as_deref() == Some(renderer_generation)
            && state.board_epoch == board_epoch
            && state.active_board_id.as_deref() != active_board_id
        {
            return Err(BrokerError::StaleReply);
        }
        let changed = state.renderer_generation.as_deref() != Some(renderer_generation)
            || state.board_epoch != board_epoch
            || state.active_board_id.as_deref() != active_board_id
            || !ready;
        if changed {
            for (_, pending) in state.pending.drain() {
                let outcome = if pending.mutates {
                    BoardReply::ExecutionUnknown
                } else {
                    BoardReply::Disconnected
                };
                let _ = pending.sender.send(outcome);
            }
        }
        state.renderer_generation = Some(renderer_generation.to_owned());
        state.board_epoch = board_epoch;
        state.active_board_id = active_board_id.map(str::to_owned);
        state.ready = ready;
        Ok(())
    }

    pub fn active_board_id(&self) -> Option<String> {
        let state = self.state.lock().expect("board broker lock poisoned");
        if state.ready {
            state.active_board_id.clone()
        } else {
            None
        }
    }

    pub fn queue(
        &self,
        board_id: &str,
        method: &str,
        params: Value,
    ) -> Result<(OutboundRequest, mpsc::Receiver<BoardReply>), BrokerError> {
        self.queue_with_timeout(board_id, method, params, Duration::from_secs(10))
    }

    pub fn queue_with_timeout(
        &self,
        board_id: &str,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<(OutboundRequest, mpsc::Receiver<BoardReply>), BrokerError> {
        if !METHODS.contains(&method) {
            return Err(BrokerError::UnsupportedMethod);
        }
        if !valid_board_id(board_id) {
            return Err(BrokerError::InvalidBoardId);
        }
        let lifetime = timeout.min(Duration::from_secs(10));
        if lifetime.is_zero() {
            return Err(BrokerError::Timeout);
        }
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if !state.ready {
            return Err(BrokerError::NotReady);
        }
        if state.pending.len() >= MAX_PENDING {
            return Err(BrokerError::Busy);
        }
        let renderer_generation = state
            .renderer_generation
            .clone()
            .ok_or(BrokerError::NotReady)?;
        let deadline = Instant::now() + lifetime;
        let request = OutboundRequest {
            request_id: format!(
                "{}-{}",
                self.app_generation,
                self.next_request.fetch_add(1, Ordering::Relaxed)
            ),
            app_generation: self.app_generation.clone(),
            renderer_generation: renderer_generation.clone(),
            board_epoch: state.board_epoch,
            board_id: board_id.to_owned(),
            schema_version: SCHEMA_VERSION,
            expires_at_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64
                + lifetime.as_millis() as u64,
            method: method.to_owned(),
            params,
        };
        if serde_json::to_vec(&request)
            .map_err(|_| BrokerError::RequestTooLarge)?
            .len()
            > MAX_REQUEST_BYTES
        {
            return Err(BrokerError::RequestTooLarge);
        }
        let (sender, receiver) = mpsc::channel();
        state.pending.insert(
            request.request_id.clone(),
            Pending {
                renderer_generation,
                board_epoch: request.board_epoch,
                board_id: board_id.to_owned(),
                mutates: !READ_ONLY_METHODS.contains(&method),
                deadline,
                sender,
            },
        );
        Ok((request, receiver))
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if let Some(pending) = state.pending.remove(request_id) {
            let outcome = if pending.mutates {
                BoardReply::ExecutionUnknown
            } else {
                BoardReply::Disconnected
            };
            let _ = pending.sender.send(outcome);
            return pending.mutates;
        }
        false
    }

    pub fn await_reply(
        &self,
        request_id: &str,
        receiver: mpsc::Receiver<BoardReply>,
        timeout: Duration,
    ) -> Result<BoardReply, BrokerError> {
        let (remaining, mutates) = self
            .state
            .lock()
            .expect("board broker lock poisoned")
            .pending
            .get(request_id)
            .map(|pending| {
                (
                    Some(pending.deadline.saturating_duration_since(Instant::now())),
                    pending.mutates,
                )
            })
            .unwrap_or((None, false));
        if remaining == Some(Duration::ZERO) {
            self.cancel(request_id);
            return Err(if mutates {
                BrokerError::ExecutionUnknown
            } else {
                BrokerError::Timeout
            });
        }
        let wait = remaining.unwrap_or(Duration::ZERO).min(timeout);
        match receiver.recv_timeout(wait) {
            Ok(BoardReply::TimedOut) => Err(BrokerError::Timeout),
            Ok(BoardReply::ExecutionUnknown) => Err(BrokerError::ExecutionUnknown),
            Ok(reply) => Ok(reply),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.cancel(request_id);
                Err(if mutates {
                    BrokerError::ExecutionUnknown
                } else {
                    BrokerError::Timeout
                })
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.cancel(request_id);
                Err(BrokerError::NotReady)
            }
        }
    }

    pub fn accept_reply_json(&self, raw: &str) -> Result<(), BrokerError> {
        if raw.len() > MAX_REPLY_BYTES {
            return Err(BrokerError::ReplyTooLarge);
        }
        let reply: IncomingReply =
            serde_json::from_str(raw).map_err(|_| BrokerError::InvalidReply)?;
        let mut state = self.state.lock().expect("board broker lock poisoned");
        let pending = state
            .pending
            .get(&reply.request_id)
            .ok_or(BrokerError::UnknownRequest)?;
        if Instant::now() >= pending.deadline {
            let expired = state
                .pending
                .remove(&reply.request_id)
                .expect("pending request vanished");
            let outcome = if expired.mutates {
                BoardReply::ExecutionUnknown
            } else {
                BoardReply::TimedOut
            };
            let error = if expired.mutates {
                BrokerError::ExecutionUnknown
            } else {
                BrokerError::Timeout
            };
            let _ = expired.sender.send(outcome);
            return Err(error);
        }
        if reply.schema_version != SCHEMA_VERSION
            || reply.app_generation != self.app_generation
            || reply.renderer_generation != pending.renderer_generation
            || reply.board_epoch != pending.board_epoch
            || reply.board_id != pending.board_id
            || state.renderer_generation.as_deref() != Some(&reply.renderer_generation)
            || state.board_epoch != reply.board_epoch
            || !state.ready
        {
            return Err(BrokerError::StaleReply);
        }
        let result = match (reply.ok, reply.result, reply.error) {
            (true, Some(result), None) => BoardReply::Success(result),
            (false, None, Some(error))
                if !error.code.is_empty()
                    && error.code.len() <= 64
                    && !error.message.is_empty()
                    && error.message.len() <= 256 =>
            {
                BoardReply::Failure {
                    code: error.code,
                    message: error.message,
                }
            }
            _ => return Err(BrokerError::InvalidReply),
        };
        let pending = state
            .pending
            .remove(&reply.request_id)
            .expect("pending reply vanished");
        let _ = pending.sender.send(result);
        Ok(())
    }
}

#[tauri::command]
pub(crate) fn board_bridge_state(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
    renderer_generation: String,
    board_epoch: u64,
    active_board_id: Option<String>,
    ready: bool,
) -> Result<String, String> {
    if webview.label() != "main" {
        return Err("Board bridge unavailable".into());
    }
    broker
        .renderer_state(
            &renderer_generation,
            board_epoch,
            ready,
            active_board_id.as_deref(),
        )
        .map_err(|_| "Invalid board bridge state".to_string())?;
    Ok(broker.app_generation().to_owned())
}

#[tauri::command]
pub(crate) fn board_bridge_reply(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
    reply_json: String,
) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("Board bridge unavailable".into());
    }
    broker
        .accept_reply_json(&reply_json)
        .map_err(|_| "Invalid or stale board bridge reply".to_string())
}

/** Dispatches only from trusted native code; the WebView has no invoke command to start a request. */
pub fn emit_request(
    app: &tauri::AppHandle,
    broker: &BoardRequestBroker,
    board_id: &str,
    method: &str,
    params: Value,
) -> Result<(String, mpsc::Receiver<BoardReply>), BrokerError> {
    let (request, receiver) = broker.queue(board_id, method, params)?;
    let request_id = request.request_id.clone();
    if app
        .emit_to("main", "mathboard-board-request", request)
        .is_err()
    {
        broker.cancel(&request_id);
        return Err(BrokerError::NotReady);
    }
    Ok((request_id, receiver))
}
