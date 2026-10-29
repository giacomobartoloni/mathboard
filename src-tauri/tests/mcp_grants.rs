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

fn grant_read(broker: &BoardRequestBroker) {
    let status = broker.mcp_status();
    broker
        .mcp_grant_read("mb_a", 1, status.grant_epoch, "renderer-1")
        .unwrap();
}

fn grant_screenshot(broker: &BoardRequestBroker) {
    let status = broker.mcp_status();
    broker
        .mcp_grant_screenshot("mb_a", 1, status.grant_epoch, "renderer-1")
        .unwrap();
}

#[test]
fn mcp_reads_require_explicit_enable_and_board_scoped_grant() {
    let broker = ready();
    assert!(broker.mcp_visible_methods().is_empty());
    assert_eq!(
        broker.queue_mcp_read(None, "observe", json!({})).err(),
        Some(BrokerError::PermissionDenied)
    );
    broker.mcp_set_enabled(true);
    assert!(broker.mcp_visible_methods().is_empty());
    assert_eq!(
        broker.queue_mcp_read(None, "observe", json!({})).err(),
        Some(BrokerError::PermissionDenied)
    );
    grant_read(&broker);
    assert_eq!(broker.mcp_visible_methods(), ["observe", "measure"]);
    let (request, _receiver, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    assert_eq!(request.board_id, "mb_a");
    assert!(broker.mcp_lease_valid(&lease));
    assert_eq!(
        broker
            .queue_mcp_read(Some("mb_b"), "observe", json!({}))
            .err(),
        Some(BrokerError::BoardContextChanged)
    );
    assert_eq!(
        broker
            .queue_mcp_read(Some("mb_a"), "create", json!({}))
            .err(),
        Some(BrokerError::UnsupportedMethod)
    );
    assert_eq!(
        broker
            .queue_mcp_read(None, "measure", json!({"id":"x"}))
            .err(),
        Some(BrokerError::InvalidBoardId)
    );
}

#[test]
fn screenshot_requires_separate_grant_and_revoke_invalidates_old_lease() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    grant_read(&broker);
    assert_eq!(
        broker
            .queue_mcp_read(Some("mb_a"), "screenshot", json!({}))
            .err(),
        Some(BrokerError::ScreenshotNotAuthorized)
    );
    let (_, prior_receiver, prior_lease) =
        broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    grant_screenshot(&broker);
    assert_eq!(prior_receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&prior_lease));
    assert_eq!(
        broker.mcp_visible_methods(),
        ["observe", "measure", "screenshot"]
    );
    let (request, receiver, old_lease) = broker
        .queue_mcp_read(Some("mb_a"), "screenshot", json!({}))
        .unwrap();
    broker.mcp_revoke_all();
    assert!(broker.mcp_visible_methods().is_empty());
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&old_lease));
    grant_read(&broker);
    grant_screenshot(&broker);
    assert!(!broker.mcp_lease_valid(&old_lease));
    assert_eq!(broker.accept_reply_json(&json!({"requestId":request.request_id,"appGeneration":"app-1","rendererGeneration":"renderer-1","boardEpoch":1,"boardId":"mb_a","schemaVersion":2,"ok":true,"result":{}}).to_string()), Err(BrokerError::UnknownRequest));
}

#[test]
fn active_board_transition_revokes_grants_without_affecting_addressed_internal_reads() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    grant_read(&broker);
    let (_, receiver, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    broker
        .renderer_state("renderer-1", 2, true, Some("mb_b"))
        .unwrap();
    assert_eq!(
        broker
            .mcp_grant_read("mb_a", 1, broker.mcp_status().grant_epoch, "renderer-1")
            .err(),
        Some(BrokerError::BoardContextChanged)
    );
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
    assert!(!broker.mcp_lease_valid(&lease));
    assert_eq!(
        broker.queue_mcp_read(None, "observe", json!({})).err(),
        Some(BrokerError::PermissionDenied)
    );
    assert_eq!(
        broker
            .queue("mb_a", "observe", json!({}))
            .unwrap()
            .0
            .board_id,
        "mb_a"
    );
}

#[test]
fn stale_permission_click_cannot_restore_read_or_screenshot_after_revoke() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let before_read = broker.mcp_status();
    broker.mcp_revoke_all();
    assert_eq!(
        broker
            .mcp_grant_read("mb_a", 1, before_read.grant_epoch, "renderer-1")
            .err(),
        Some(BrokerError::BoardContextChanged)
    );
    grant_read(&broker);
    let before_screenshot = broker.mcp_status();
    broker.mcp_revoke_all();
    grant_read(&broker);
    assert_eq!(
        broker
            .mcp_grant_screenshot("mb_a", 1, before_screenshot.grant_epoch, "renderer-1")
            .err(),
        Some(BrokerError::BoardContextChanged)
    );
    assert!(!broker.mcp_status().screenshot);
}

#[test]
fn renderer_reload_with_same_board_and_epoch_rejects_old_consent() {
    let broker = ready();
    broker.mcp_set_enabled(true);
    let before_reload = broker.mcp_status();
    broker
        .renderer_state("renderer-2", 1, true, Some("mb_a"))
        .unwrap();
    assert_eq!(
        broker
            .mcp_grant_read("mb_a", 1, before_reload.grant_epoch, "renderer-1")
            .err(),
        Some(BrokerError::BoardContextChanged)
    );
    let current = broker.mcp_status();
    broker
        .mcp_grant_read("mb_a", 1, current.grant_epoch, "renderer-2")
        .unwrap();
}
