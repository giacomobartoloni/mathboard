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

use app_lib::mcp_contract::ToolCall;
use app_lib::mcp_server::{
    MathBoardMcpServer, McpReadBackend, McpReadError, McpReadOutput, McpReadReceipt,
};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct FakeBackend {
    visible: Arc<Mutex<Vec<&'static str>>>,
    revoke_on_read: bool,
}

impl McpReadBackend for FakeBackend {
    type Lease = &'static str;
    async fn visible_methods(&self) -> Vec<&'static str> {
        self.visible.lock().unwrap().clone()
    }
    async fn read(&self, call: ToolCall) -> Result<McpReadReceipt<Self::Lease>, McpReadError> {
        if !self.visible.lock().unwrap().contains(&call.method()) {
            return Err(McpReadError::PermissionDenied);
        }
        if self.revoke_on_read {
            self.visible.lock().unwrap().clear();
        }
        Ok(McpReadReceipt {
            output: McpReadOutput::Json(json!({"method":call.method(),"boardId":call.board_id()})),
            lease: call.method(),
        })
    }
    async fn lease_valid(&self, lease: &Self::Lease) -> bool {
        self.visible.lock().unwrap().contains(lease)
    }
}

#[tokio::test]
async fn catalog_changes_with_grants_and_cached_calls_are_denied_after_revoke() {
    let backend = FakeBackend {
        visible: Arc::new(Mutex::new(vec![])),
        revoke_on_read: false,
    };
    let server = MathBoardMcpServer::new(backend.clone());
    assert!(server.catalog().await.is_empty());
    backend
        .visible
        .lock()
        .unwrap()
        .extend(["observe", "measure"]);
    assert_eq!(
        server
            .catalog()
            .await
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<Vec<_>>(),
        ["mathboard_observe", "mathboard_measure"]
    );
    let response = server
        .dispatch("mathboard_observe", json!({}))
        .await
        .unwrap();
    assert_eq!(
        response.structured_content,
        Some(json!({"method":"observe","boardId":null}))
    );
    backend.visible.lock().unwrap().clear();
    let denied = server
        .dispatch("mathboard_observe", json!({}))
        .await
        .unwrap();
    assert_eq!(denied.is_error, Some(true));
    assert!(
        serde_json::to_value(denied)
            .unwrap()
            .to_string()
            .contains("permission_denied")
    );
}

#[tokio::test]
async fn unknown_tools_and_invalid_args_are_protocol_errors() {
    let backend = FakeBackend {
        visible: Arc::new(Mutex::new(vec!["observe", "measure", "screenshot"])),
        revoke_on_read: false,
    };
    let server = MathBoardMcpServer::new(backend);
    assert!(
        server
            .dispatch("mathboard_create", json!({}))
            .await
            .is_err()
    );
    assert!(
        server
            .dispatch("mathboard_measure", json!({"boardId":"mb_a"}))
            .await
            .is_err()
    );
    let image = McpReadOutput::Png(vec![137, 80, 78, 71]);
    let encoded: Value = serde_json::to_value(image.into_result()).unwrap();
    assert_eq!(encoded["content"][0]["type"], "image");
    assert_eq!(encoded["content"][0]["mimeType"], "image/png");
}

#[tokio::test]
async fn result_is_discarded_if_grant_changes_after_backend_read() {
    let backend = FakeBackend {
        visible: Arc::new(Mutex::new(vec!["observe"])),
        revoke_on_read: true,
    };
    let server = MathBoardMcpServer::new(backend);
    let denied = server
        .dispatch("mathboard_observe", json!({}))
        .await
        .unwrap();
    assert_eq!(denied.is_error, Some(true));
    assert_eq!(denied.structured_content, None);
    assert!(
        serde_json::to_value(denied)
            .unwrap()
            .to_string()
            .contains("permission_denied")
    );
}

#[test]
fn serialized_result_budget_includes_structured_and_escaped_text_copies() {
    let value = json!({"text":"\\\"".repeat(3 * 1024 * 1024)});
    let result = McpReadOutput::Json(value).into_result();
    assert_eq!(result.is_error, Some(true));
    assert!(serde_json::to_vec(&result).unwrap().len() < 7 * 1024 * 1024);
}
