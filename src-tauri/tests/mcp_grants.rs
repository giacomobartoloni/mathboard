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

use app_lib::board_bridge::{BoardReply, BoardRequestBroker, BrokerError};
use serde_json::json;

fn ready() -> BoardRequestBroker {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 1, true, Some("mb_a"))
        .unwrap();
    broker
}

#[test]
fn enabling_mcp_exposes_all_read_tools_without_separate_grants() {
    let broker = ready();
    assert!(broker.mcp_visible_methods().is_empty());
    assert_eq!(
        broker.queue_mcp_read(None, "observe", json!({})).err(),
        Some(BrokerError::PermissionDenied)
    );
    broker.mcp_set_enabled(true);
    assert_eq!(
        broker.mcp_visible_methods(),
        ["observe", "measure", "screenshot", "command"]
    );
    // The MCP command wrapper resolves to a concrete board method before native admission.
    for method in ["observe", "measure", "screenshot"] {
        let board_id = if method == "observe" {
            None
        } else {
            Some("mb_a")
        };
        let (request, _, lease) = broker.queue_mcp_read(board_id, method, json!({})).unwrap();
        assert!(broker.mcp_lease_valid(&lease));
        assert_eq!(request.board_id, "mb_a");
        broker.mcp_release_lease(&lease);
    }
    let (create, _, create_lease) = broker
        .queue_mcp_read(
            Some("mb_a"),
            "create",
            json!({"spec":{"type":"text","text":"Hello"}}),
        )
        .unwrap();
    assert_eq!(create.method, "create");
    assert!(broker.mcp_lease_valid(&create_lease));
    let (library, _, _) = broker
        .queue_mcp_read(None, "boards.list", json!({}))
        .unwrap();
    assert_eq!(library.method, "boards.list");
    assert_eq!(
        broker
            .queue_mcp_read(Some("mb_a"), "arbitrary", json!({}))
            .err(),
        Some(BrokerError::UnsupportedMethod)
    );
}

#[test]
fn enabled_mcp_accepts_explicit_non_active_board_ids() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (request, _, lease) = broker
        .queue_mcp_read(Some("mb_b"), "measure", json!({"id":"x"}))
        .unwrap();
    assert_eq!(request.board_id, "mb_b");
    assert_eq!(lease.board_id(), "mb_b");
    assert!(broker.mcp_lease_valid(&lease));
    assert_eq!(
        broker
            .queue_mcp_read(None, "measure", json!({"id":"x"}))
            .err(),
        Some(BrokerError::InvalidBoardId)
    );
}

#[test]
fn board_switch_keeps_mcp_enabled_but_invalidates_prior_lease() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (_, receiver, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    broker
        .renderer_state("renderer-1", 2, true, Some("mb_b"))
        .unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&lease));
    assert!(broker.mcp_status().enabled);
    assert_eq!(
        broker.mcp_visible_methods(),
        ["observe", "measure", "screenshot", "command"]
    );
    let (request, _, _) = broker
        .queue_mcp_read(Some("mb_a"), "observe", json!({}))
        .unwrap();
    assert_eq!(request.board_id, "mb_a");
}

#[test]
fn disabling_mcp_cancels_all_pending_requests_and_issued_leases() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (request, receiver, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    broker.mcp_set_enabled(false);
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&lease));
    assert!(broker.mcp_visible_methods().is_empty());
    assert_eq!(
        broker.queue_mcp_read(None, "observe", json!({})).err(),
        Some(BrokerError::PermissionDenied)
    );
    assert_eq!(
        broker.accept_reply_json(
            &json!({"requestId":request.request_id,"appGeneration":"app-1","rendererGeneration":"renderer-1","boardEpoch":1,"boardId":"mb_a","schemaVersion":2,"ok":true,"result":{}})
                .to_string()
        ),
        Err(BrokerError::UnknownRequest)
    );
    broker.mcp_set_enabled(true);
    assert!(!broker.mcp_lease_valid(&lease));
}

#[test]
fn mcp_is_disabled_on_app_restart_and_lease_is_app_scoped() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (_, _, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    let serialized = serde_json::to_value(&lease).unwrap();
    let roundtrip = serde_json::from_value(serialized.clone()).unwrap();
    assert!(broker.mcp_lease_valid(&roundtrip));
    let mut forged = serialized;
    forged["requestId"] = json!("fake");
    assert!(!broker.mcp_lease_valid(&serde_json::from_value(forged).unwrap()));
    let restarted = BoardRequestBroker::new("app-2");
    restarted
        .renderer_state("renderer-1", 1, true, Some("mb_a"))
        .unwrap();
    assert!(!restarted.mcp_status().enabled);
    restarted.mcp_set_enabled(true);
    assert!(!restarted.mcp_lease_valid(&roundtrip));
}

#[test]
fn renderer_reload_keeps_mcp_enabled_but_invalidates_old_receipt() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (_, _, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    broker
        .renderer_state("renderer-2", 1, true, Some("mb_a"))
        .unwrap();
    assert!(broker.mcp_status().enabled);
    assert!(!broker.mcp_lease_valid(&lease));
}

#[test]
fn board_library_transition_preserves_only_its_own_mcp_receipt() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (request, receiver, lease) = broker
        .queue_mcp_read(None, "boards.create", json!({"title": "MCP Test"}))
        .unwrap();
    let (_, read_receiver, read_lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    broker
        .renderer_state("renderer-1", 2, false, Some("mb_a"))
        .unwrap();
    assert_eq!(read_receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&read_lease));
    assert!(!broker.mcp_lease_valid(&lease));
    broker
        .renderer_state("renderer-1", 3, true, Some("mb_new"))
        .unwrap();
    let result = json!({"id": "mb_new", "title": "MCP Test", "isActive": true});
    broker
        .accept_reply_json(
            &json!({"requestId": request.request_id, "appGeneration": "app-1",
                "rendererGeneration": "renderer-1", "boardEpoch": 1, "boardId": "mb_a",
                "schemaVersion": 2, "ok": true, "result": result})
            .to_string(),
        )
        .unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::Success(result));
    assert!(broker.mcp_lease_valid(&lease));
    broker.mcp_release_lease(&lease);
    assert!(!broker.mcp_lease_valid(&lease));
}

#[test]
fn board_library_transition_cannot_outlive_mcp_off_or_renderer_replacement() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (request, receiver, lease) = broker
        .queue_mcp_read(None, "boards.open", json!({"boardId": "mb_b"}))
        .unwrap();
    broker
        .renderer_state("renderer-1", 2, false, Some("mb_a"))
        .unwrap();
    broker.mcp_set_enabled(false);
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&lease));
    broker.mcp_set_enabled(true);
    assert!(!broker.mcp_lease_valid(&lease));
    assert_eq!(
        broker.accept_reply_json(
            &json!({"requestId": request.request_id, "appGeneration": "app-1",
                "rendererGeneration": "renderer-1", "boardEpoch": 1, "boardId": "mb_a",
                "schemaVersion": 2, "ok": true, "result": {}})
            .to_string(),
        ),
        Err(BrokerError::UnknownRequest)
    );

    // The prior transition left the renderer temporarily unavailable.
    broker
        .renderer_state("renderer-1", 3, true, Some("mb_a"))
        .unwrap();
    let (_, receiver, lease) = broker
        .queue_mcp_read(None, "boards.create", json!({"title": "Other"}))
        .unwrap();
    broker
        .renderer_state("renderer-2", 0, true, Some("mb_a"))
        .unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::ExecutionUnknown);
    assert!(!broker.mcp_lease_valid(&lease));
}

#[test]
fn canvas_mutation_does_not_survive_a_board_transition() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let (_, receiver, lease) = broker
        .queue_mcp_read(None, "create", json!({"spec": {"type": "text"}}))
        .unwrap();
    broker
        .renderer_state("renderer-1", 2, false, Some("mb_a"))
        .unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::ExecutionUnknown);
    assert!(!broker.mcp_lease_valid(&lease));
}
