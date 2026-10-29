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
const MAX_MCP_LEASES: usize = 64;
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
    PermissionDenied,
    ScreenshotNotAuthorized,
    BoardContextChanged,
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
    mcp_grant_epoch: Option<u64>,
}

#[derive(Default)]
struct BrokerState {
    renderer_generation: Option<String>,
    board_epoch: u64,
    active_board_id: Option<String>,
    ready: bool,
    pending: HashMap<String, Pending>,
    mcp_enabled: bool,
    mcp_read_board_id: Option<String>,
    mcp_screenshot: bool,
    mcp_grant_epoch: u64,
    mcp_leases: HashMap<String, IssuedMcpLease>,
}

struct IssuedMcpLease {
    lease: McpReadLease,
    deadline: Instant,
}

/** A single read admission tied to the app, renderer and permission generation. */
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpReadLease {
    app_generation: String,
    request_id: String,
    expires_at_ms: u64,
    grant_epoch: u64,
    board_epoch: u64,
    renderer_generation: String,
    board_id: String,
}

impl McpReadLease {
    pub fn board_id(&self) -> &str {
        &self.board_id
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpPermissionStatus {
    pub enabled: bool,
    pub active_board_id: Option<String>,
    pub board_epoch: u64,
    pub renderer_generation: Option<String>,
    pub grant_epoch: u64,
    pub read_board_id: Option<String>,
    pub screenshot: bool,
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
            if !ready
                || state.renderer_generation.as_deref() != Some(renderer_generation)
                || state.active_board_id.as_deref() != active_board_id
            {
                Self::revoke_mcp_locked(&mut state);
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

    fn revoke_mcp_locked(state: &mut BrokerState) {
        state.mcp_read_board_id = None;
        state.mcp_screenshot = false;
        Self::rotate_mcp_epoch_locked(state);
    }

    fn rotate_mcp_epoch_locked(state: &mut BrokerState) {
        state.mcp_grant_epoch = state.mcp_grant_epoch.wrapping_add(1);
        state.mcp_leases.clear();
        let ids: Vec<_> = state
            .pending
            .iter()
            .filter(|(_, pending)| pending.mcp_grant_epoch.is_some())
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            if let Some(pending) = state.pending.remove(&id) {
                let _ = pending.sender.send(BoardReply::Disconnected);
            }
        }
    }

    pub fn mcp_status(&self) -> McpPermissionStatus {
        let state = self.state.lock().expect("board broker lock poisoned");
        McpPermissionStatus {
            enabled: state.mcp_enabled,
            active_board_id: if state.ready {
                state.active_board_id.clone()
            } else {
                None
            },
            board_epoch: state.board_epoch,
            renderer_generation: state.renderer_generation.clone(),
            grant_epoch: state.mcp_grant_epoch,
            read_board_id: state.mcp_read_board_id.clone(),
            screenshot: state.mcp_screenshot,
        }
    }

    pub fn mcp_visible_methods(&self) -> Vec<&'static str> {
        let state = self.state.lock().expect("board broker lock poisoned");
        if !state.mcp_enabled || !state.ready || state.mcp_read_board_id != state.active_board_id {
            return Vec::new();
        }
        let mut methods = vec!["observe", "measure"];
        if state.mcp_screenshot {
            methods.push("screenshot");
        }
        methods
    }

    pub fn mcp_set_enabled(&self, enabled: bool) {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if state.mcp_enabled != enabled {
            Self::revoke_mcp_locked(&mut state);
            state.mcp_enabled = enabled;
        }
    }

    pub fn mcp_grant_read(
        &self,
        expected_board_id: &str,
        expected_board_epoch: u64,
        expected_grant_epoch: u64,
        expected_renderer_generation: &str,
    ) -> Result<McpPermissionStatus, BrokerError> {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if !state.mcp_enabled || !state.ready {
            return Err(BrokerError::NotReady);
        }
        if !valid_board_id(expected_board_id) {
            return Err(BrokerError::InvalidBoardId);
        }
        if state.active_board_id.as_deref() != Some(expected_board_id)
            || state.board_epoch != expected_board_epoch
            || state.mcp_grant_epoch != expected_grant_epoch
            || state.renderer_generation.as_deref() != Some(expected_renderer_generation)
        {
            return Err(BrokerError::BoardContextChanged);
        }
        let board_id = state.active_board_id.clone().ok_or(BrokerError::NotReady)?;
        Self::revoke_mcp_locked(&mut state);
        state.mcp_read_board_id = Some(board_id);
        Ok(McpPermissionStatus {
            enabled: true,
            active_board_id: state.active_board_id.clone(),
            board_epoch: state.board_epoch,
            renderer_generation: state.renderer_generation.clone(),
            grant_epoch: state.mcp_grant_epoch,
            read_board_id: state.mcp_read_board_id.clone(),
            screenshot: false,
        })
    }

    pub fn mcp_grant_screenshot(
        &self,
        expected_board_id: &str,
        expected_board_epoch: u64,
        expected_grant_epoch: u64,
        expected_renderer_generation: &str,
    ) -> Result<McpPermissionStatus, BrokerError> {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if state.active_board_id.as_deref() != Some(expected_board_id)
            || state.board_epoch != expected_board_epoch
            || state.mcp_grant_epoch != expected_grant_epoch
            || state.renderer_generation.as_deref() != Some(expected_renderer_generation)
        {
            return Err(BrokerError::BoardContextChanged);
        }
        if !state.mcp_enabled || !state.ready || state.mcp_read_board_id != state.active_board_id {
            return Err(BrokerError::PermissionDenied);
        }
        if !state.mcp_screenshot {
            Self::rotate_mcp_epoch_locked(&mut state);
            state.mcp_screenshot = true;
        }
        Ok(McpPermissionStatus {
            enabled: true,
            active_board_id: state.active_board_id.clone(),
            board_epoch: state.board_epoch,
            renderer_generation: state.renderer_generation.clone(),
            grant_epoch: state.mcp_grant_epoch,
            read_board_id: state.mcp_read_board_id.clone(),
            screenshot: true,
        })
    }

    pub fn mcp_revoke_all(&self) {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        Self::revoke_mcp_locked(&mut state);
    }

    pub fn mcp_lease_valid(&self, lease: &McpReadLease) -> bool {
        let state = self.state.lock().expect("board broker lock poisoned");
        let issued = state.mcp_leases.get(&lease.request_id);
        state.mcp_enabled
            && state.ready
            && self.app_generation == lease.app_generation
            && issued.is_some_and(|entry| entry.lease == *lease && Instant::now() < entry.deadline)
            && state.mcp_grant_epoch == lease.grant_epoch
            && state.board_epoch == lease.board_epoch
            && state.renderer_generation.as_deref() == Some(&lease.renderer_generation)
            && state.active_board_id.as_deref() == Some(&lease.board_id)
            && state.mcp_read_board_id.as_deref() == Some(&lease.board_id)
    }

    pub fn mcp_release_lease(&self, lease: &McpReadLease) {
        let mut state = self.state.lock().expect("board broker lock poisoned");
        if state
            .mcp_leases
            .get(&lease.request_id)
            .is_some_and(|entry| entry.lease == *lease)
        {
            state.mcp_leases.remove(&lease.request_id);
        }
    }

    pub fn queue_mcp_read(
        &self,
        board_id: Option<&str>,
        method: &str,
        params: Value,
    ) -> Result<(OutboundRequest, mpsc::Receiver<BoardReply>, McpReadLease), BrokerError> {
        if !READ_ONLY_METHODS.contains(&method) {
            return Err(BrokerError::UnsupportedMethod);
        }
        let mut state = self.state.lock().expect("board broker lock poisoned");
        state
            .mcp_leases
            .retain(|_, issued| Instant::now() < issued.deadline);
        if state.mcp_leases.len() >= MAX_MCP_LEASES {
            return Err(BrokerError::Busy);
        }
        if !state.mcp_enabled || state.mcp_read_board_id.is_none() {
            return Err(BrokerError::PermissionDenied);
        }
        if method == "screenshot" && !state.mcp_screenshot {
            return Err(BrokerError::ScreenshotNotAuthorized);
        }
        if method != "observe" && board_id.is_none() {
            return Err(BrokerError::InvalidBoardId);
        }
        let active = state.active_board_id.clone().ok_or(BrokerError::NotReady)?;
        let target = board_id.unwrap_or(&active);
        if !valid_board_id(target) {
            return Err(BrokerError::InvalidBoardId);
        }
        if target != active || state.mcp_read_board_id.as_deref() != Some(target) {
            return Err(BrokerError::BoardContextChanged);
        }
        let grant_epoch = state.mcp_grant_epoch;
        let board_epoch = state.board_epoch;
        let renderer_generation = state
            .renderer_generation
            .clone()
            .ok_or(BrokerError::NotReady)?;
        let (request, receiver) = self.queue_locked(
            &mut state,
            target,
            method,
            params,
            Duration::from_secs(10),
            Some(grant_epoch),
        )?;
        let lease = McpReadLease {
            app_generation: self.app_generation.clone(),
            request_id: request.request_id.clone(),
            expires_at_ms: request.expires_at_ms,
            grant_epoch,
            board_epoch,
            renderer_generation,
            board_id: active,
        };
        let deadline = state
            .pending
            .get(&request.request_id)
            .expect("new request missing")
            .deadline;
        state.mcp_leases.insert(
            request.request_id.clone(),
            IssuedMcpLease {
                lease: lease.clone(),
                deadline,
            },
        );
        Ok((request, receiver, lease))
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
        let mut state = self.state.lock().expect("board broker lock poisoned");
        self.queue_locked(&mut state, board_id, method, params, timeout, None)
    }

    fn queue_locked(
        &self,
        state: &mut BrokerState,
        board_id: &str,
        method: &str,
        params: Value,
        timeout: Duration,
        mcp_grant_epoch: Option<u64>,
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
                mcp_grant_epoch,
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

/** The MCP path admits one of three reads and its grant in the same broker lock. */
pub fn emit_mcp_read(
    app: &tauri::AppHandle,
    broker: &BoardRequestBroker,
    board_id: Option<&str>,
    method: &str,
    params: Value,
) -> Result<(String, mpsc::Receiver<BoardReply>, McpReadLease), BrokerError> {
    let (request, receiver, lease) = broker.queue_mcp_read(board_id, method, params)?;
    let request_id = request.request_id.clone();
    if app
        .emit_to("main", "mathboard-board-request", request)
        .is_err()
    {
        broker.cancel(&request_id);
        broker.mcp_release_lease(&lease);
        return Err(BrokerError::NotReady);
    }
    Ok((request_id, receiver, lease))
}

#[tauri::command]
pub(crate) fn mcp_permission_status(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
) -> Result<McpPermissionStatus, String> {
    if webview.label() != "main" {
        return Err("MCP controls unavailable".into());
    }
    Ok(broker.mcp_status())
}

#[tauri::command]
pub(crate) fn mcp_set_enabled(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
    enabled: bool,
) -> Result<McpPermissionStatus, String> {
    if webview.label() != "main" {
        return Err("MCP controls unavailable".into());
    }
    broker.mcp_set_enabled(enabled);
    Ok(broker.mcp_status())
}

#[tauri::command]
pub(crate) fn mcp_grant_read(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
    expected_board_id: String,
    expected_board_epoch: u64,
    expected_grant_epoch: u64,
    expected_renderer_generation: String,
) -> Result<McpPermissionStatus, String> {
    if webview.label() != "main" {
        return Err("MCP controls unavailable".into());
    }
    broker
        .mcp_grant_read(
            &expected_board_id,
            expected_board_epoch,
            expected_grant_epoch,
            &expected_renderer_generation,
        )
        .map_err(|_| "Board context changed or MCP unavailable".to_owned())
}

#[tauri::command]
pub(crate) fn mcp_grant_screenshot(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
    expected_board_id: String,
    expected_board_epoch: u64,
    expected_grant_epoch: u64,
    expected_renderer_generation: String,
) -> Result<McpPermissionStatus, String> {
    if webview.label() != "main" {
        return Err("MCP controls unavailable".into());
    }
    broker
        .mcp_grant_screenshot(
            &expected_board_id,
            expected_board_epoch,
            expected_grant_epoch,
            &expected_renderer_generation,
        )
        .map_err(|_| "Board context changed or read access unavailable".to_owned())
}

#[tauri::command]
pub(crate) fn mcp_revoke_all(
    webview: tauri::Webview,
    broker: tauri::State<'_, BoardRequestBroker>,
) -> Result<McpPermissionStatus, String> {
    if webview.label() != "main" {
        return Err("MCP controls unavailable".into());
    }
    broker.mcp_revoke_all();
    Ok(broker.mcp_status())
}
