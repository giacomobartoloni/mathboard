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

//! Companion-side native IPC adapter. Every call connects to the running app only.

use crate::board_bridge::McpReadLease;
use crate::mcp_contract::ToolCall;
use crate::mcp_ipc_protocol::IpcReply;
use crate::mcp_server::{McpReadBackend, McpReadError, McpReadOutput, McpReadReceipt};
use base64::Engine;
use serde_json::{Value, json};

fn roundtrip(request: Value) -> Result<IpcReply, McpReadError> {
    #[cfg(unix)]
    return crate::mcp_ipc_unix::exchange(request).map_err(|_| McpReadError::Unavailable);
    #[cfg(not(unix))]
    {
        let _ = request;
        Err(McpReadError::Unavailable)
    }
}

fn safe_error(code: &str) -> McpReadError {
    match code {
        "permission_denied" => McpReadError::PermissionDenied,
        "board_context_required" | "board_context_changed" => McpReadError::BoardContextChanged,
        "board_busy" => McpReadError::BoardBusy,
        "invalid_tool_arguments" => McpReadError::InvalidToolArguments,
        "execution_unknown" => McpReadError::ExecutionUnknown,
        "capture_too_large" => McpReadError::CaptureTooLarge,
        "mcp_unavailable" | "read_cancelled" => McpReadError::Unavailable,
        _ => McpReadError::Internal,
    }
}

pub(crate) fn read_reply_result(
    reply: IpcReply,
) -> Result<McpReadReceipt<McpReadLease>, McpReadError> {
    match reply {
        IpcReply::ReadJson { value, lease } => Ok(McpReadReceipt {
            output: McpReadOutput::Json(value),
            lease,
        }),
        IpcReply::ReadPng { data, lease } => {
            if data.len() > 4 * (5usize * 1024 * 1024).div_ceil(3) {
                return Err(McpReadError::CaptureTooLarge);
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(data)
                .map_err(|_| McpReadError::Internal)?;
            if bytes.len() > 5 * 1024 * 1024 {
                return Err(McpReadError::CaptureTooLarge);
            }
            Ok(McpReadReceipt {
                output: McpReadOutput::Png(bytes),
                lease,
            })
        }
        IpcReply::Error { code } => Err(safe_error(&code)),
        _ => Err(McpReadError::Internal),
    }
}

#[derive(Clone, Default)]
pub struct LocalAppBackend;

impl McpReadBackend for LocalAppBackend {
    type Lease = McpReadLease;

    async fn visible_methods(&self) -> Vec<&'static str> {
        let reply =
            tokio::task::spawn_blocking(|| roundtrip(json!({"version":1,"operation":"catalog"})))
                .await;
        match reply {
            Ok(Ok(IpcReply::Catalog { methods })) => {
                ["observe", "measure", "screenshot", "command"]
                    .into_iter()
                    .filter(|method| methods.iter().any(|value| value == method))
                    .collect()
            }
            _ => Vec::new(),
        }
    }

    async fn read(&self, call: ToolCall) -> Result<McpReadReceipt<Self::Lease>, McpReadError> {
        let mut arguments = call
            .params()
            .as_object()
            .cloned()
            .ok_or(McpReadError::Internal)?;
        if let Some(board_id) = call.board_id() {
            arguments.insert("boardId".into(), Value::String(board_id.to_owned()));
        }
        let request = json!({"version":1,"operation":"read","name":format!("mathboard_{}",call.method()),"arguments":arguments});
        let reply = tokio::task::spawn_blocking(move || roundtrip(request))
            .await
            .map_err(|_| McpReadError::Unavailable)??;
        let lease = match &reply {
            IpcReply::ReadJson { lease, .. } | IpcReply::ReadPng { lease, .. } => {
                Some(lease.clone())
            }
            _ => None,
        };
        let result = read_reply_result(reply);
        if result.is_err() {
            if let Some(lease) = lease {
                self.release_lease(lease).await;
            }
        }
        result
    }

    async fn lease_valid(&self, lease: &Self::Lease) -> bool {
        let request = json!({"version":1,"operation":"check","lease":lease});
        matches!(
            tokio::task::spawn_blocking(move || roundtrip(request)).await,
            Ok(Ok(IpcReply::Check { valid: true }))
        )
    }

    async fn release_lease(&self, lease: Self::Lease) {
        let request = json!({"version":1,"operation":"release","lease":lease});
        let _ = tokio::task::spawn_blocking(move || roundtrip(request)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unknown_error_text_is_never_forwarded() {
        assert_eq!(safe_error("/home/alice/secret"), McpReadError::Internal);
        assert_eq!(
            safe_error("permission_denied"),
            McpReadError::PermissionDenied
        );
        assert_eq!(
            safe_error("invalid_tool_arguments"),
            McpReadError::InvalidToolArguments
        );
        assert_eq!(
            McpReadError::InvalidToolArguments.code(),
            "invalid_tool_arguments"
        );
    }
}
