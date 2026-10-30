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

//! Private native D dispatcher; no IPC frame can select an arbitrary C3 method.

use crate::board_bridge::{
    BoardReply, BoardRequestBroker, BrokerError, MCP_SCREENSHOT_TIMEOUT, emit_mcp_read,
};
use crate::mcp_contract::decode_screenshot;
use crate::mcp_ipc_protocol::{IpcCommand, IpcReply};
use base64::Engine;
use serde_json::Value;
use std::time::Duration;

fn error(code: &'static str) -> IpcReply {
    IpcReply::Error {
        code: code.to_owned(),
    }
}

fn broker_code(value: BrokerError) -> &'static str {
    match value {
        BrokerError::PermissionDenied => "permission_denied",
        BrokerError::BoardContextChanged | BrokerError::InvalidBoardId => "board_context_required",
        BrokerError::Busy => "board_busy",
        BrokerError::RequestTooLarge => "invalid_tool_arguments",
        BrokerError::ReplyTooLarge => "capture_too_large",
        BrokerError::Timeout => "read_cancelled",
        BrokerError::ExecutionUnknown => "execution_unknown",
        _ => "mcp_unavailable",
    }
}

pub fn safe_board_error(code: &str) -> &'static str {
    match code {
        "board_busy" => "board_busy",
        "board_context_changed" => "board_context_changed",
        "board_not_found" => "board_not_found",
        "board_archived" => "board_archived",
        "board_context_required" => "board_context_required",
        "invalid_object_spec" => "invalid_object_spec",
        "invalid_object_patch" => "invalid_object_patch",
        "object_not_found" => "object_not_found",
        "nested_object_mutation_not_supported" => "nested_object_mutation_not_supported",
        "formula_render_failed" => "formula_render_failed",
        "board_commit_failed" => "board_commit_failed",
        "capture_too_large" => "capture_too_large",
        "invalid_capture_request" => "invalid_capture_request",
        "invalid_command" => "invalid_tool_arguments",
        "capture_failed" | "board_not_ready" => "capture_unavailable",
        "command_timeout" => "read_cancelled",
        "execution_unknown" => "execution_unknown",
        "board_not_archived" => "board_not_archived",
        "invalid_board_title" => "invalid_board_title",
        "edit_in_progress" => "edit_in_progress",
        "confirmation_required" => "invalid_tool_arguments",
        _ => "internal_error",
    }
}

// A timeout does not contain board data. Classify it before the expiring
// read lease can misreport a delayed capture as revoked permission.
fn timed_out_read(reply: &Result<BoardReply, BrokerError>) -> bool {
    matches!(reply, Ok(BoardReply::TimedOut) | Err(BrokerError::Timeout))
}

pub fn dispatch(
    app: &tauri::AppHandle,
    broker: &BoardRequestBroker,
    command: IpcCommand,
) -> IpcReply {
    match command {
        IpcCommand::Catalog => IpcReply::Catalog {
            methods: broker
                .mcp_visible_methods()
                .into_iter()
                .map(str::to_owned)
                .collect(),
        },
        IpcCommand::Check(lease) => IpcReply::Check {
            valid: broker.mcp_lease_valid(&lease),
        },
        IpcCommand::Release(lease) => {
            broker.mcp_release_lease(&lease);
            IpcReply::Released
        }
        IpcCommand::Read(call) => {
            let command_params = call.params();
            let (method, params) = if call.method() == "command" {
                let Some(method) = command_params.get("method").and_then(Value::as_str) else {
                    return error("invalid_tool_arguments");
                };
                let Some(params) = command_params
                    .get("params")
                    .filter(|value| value.is_object())
                else {
                    return error("invalid_tool_arguments");
                };
                (method, params.clone())
            } else {
                (call.method(), command_params.clone())
            };
            let (request_id, receiver, lease) =
                match emit_mcp_read(app, broker, call.board_id(), method, params) {
                    Ok(pending) => pending,
                    Err(err) => return error(broker_code(err)),
                };
            let timeout = if method == "screenshot" {
                MCP_SCREENSHOT_TIMEOUT
            } else {
                Duration::from_secs(10)
            };
            let reply = broker.await_reply(&request_id, receiver, timeout);
            // A timed-out read contains no data; expiry alone must not be
            // presented as a permission revocation. A real MCP Off still wins.
            if timed_out_read(&reply) {
                let code = if broker.mcp_status().enabled {
                    "read_cancelled"
                } else {
                    "permission_denied"
                };
                broker.mcp_release_lease(&lease);
                return error(code);
            }
            // Board-changing writes may have committed before the renderer switched.
            if matches!(
                &reply,
                Ok(BoardReply::ExecutionUnknown) | Err(BrokerError::ExecutionUnknown)
            ) {
                broker.mcp_release_lease(&lease);
                return error("execution_unknown");
            }
            if !broker.mcp_lease_valid(&lease) {
                broker.mcp_release_lease(&lease);
                return error("permission_denied");
            }
            let output = match reply {
                Ok(BoardReply::Success(value)) if method == "screenshot" => {
                    match decode_screenshot(&value, lease.board_id()) {
                        Ok(bytes) => IpcReply::ReadPng {
                            data: base64::engine::general_purpose::STANDARD.encode(bytes),
                            lease: lease.clone(),
                        },
                        Err(_) => error("capture_unavailable"),
                    }
                }
                Ok(BoardReply::Success(value)) => IpcReply::ReadJson {
                    value,
                    lease: lease.clone(),
                },
                Ok(BoardReply::Failure { code, .. }) => error(safe_board_error(&code)),
                Ok(BoardReply::Disconnected | BoardReply::TimedOut) => error("read_cancelled"),
                Ok(BoardReply::ExecutionUnknown) => error("execution_unknown"),
                Err(err) => error(broker_code(err)),
            };
            if !broker.mcp_lease_valid(&lease) {
                broker.mcp_release_lease(&lease);
                return error("permission_denied");
            }
            if matches!(output, IpcReply::Error { .. }) {
                broker.mcp_release_lease(&lease);
            }
            output
        }
    }
}

#[cfg(test)]
mod c13_tests {
    use super::*;

    #[test]
    fn read_timeout_is_classified_before_lease_expiry() {
        assert!(timed_out_read(&Err(BrokerError::Timeout)));
        assert!(timed_out_read(&Ok(BoardReply::TimedOut)));
        assert!(!timed_out_read(&Err(BrokerError::PermissionDenied)));
        assert!(!timed_out_read(&Ok(BoardReply::Disconnected)));
        assert!(!timed_out_read(&Ok(BoardReply::Success(
            serde_json::json!({})
        ))));
    }
}
