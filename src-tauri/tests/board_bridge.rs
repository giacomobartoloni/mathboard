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

use app_lib::board_bridge::{BoardReply, BoardRequestBroker, BrokerError};
use serde_json::json;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[test]
fn addressed_request_binds_target_and_rejects_wrong_board_reply() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker.queue("mb_other", "observe", json!({})).unwrap();
    assert_eq!(request.board_id, "mb_other");
    assert_eq!(request.schema_version, 2);
    let wrong = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_active",
      "schemaVersion": 2, "ok": true, "result": {"stable": true}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&wrong),
        Err(BrokerError::StaleReply)
    );
    let correct = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_other",
      "schemaVersion": 2, "ok": true, "result": {"stable": true}})
    .to_string();
    broker.accept_reply_json(&correct).unwrap();
    assert_eq!(
        receiver.recv().unwrap(),
        BoardReply::Success(json!({"stable": true}))
    );
}

#[test]
fn invalid_targets_and_legacy_replies_are_rejected() {
    let broker = BoardRequestBroker::new("app-1");
    assert_eq!(
        broker.renderer_state("renderer-1", 0, true, None),
        Err(BrokerError::InvalidBoardId)
    );
    broker
        .renderer_state("renderer-1", 0, true, Some("mb_active"))
        .unwrap();
    for id in [
        "",
        "active",
        "mb_",
        "mb_bad!",
        &format!("mb_{}", "x".repeat(129)),
    ] {
        assert_eq!(
            broker.queue(id, "observe", json!({})).err(),
            Some(BrokerError::InvalidBoardId)
        );
    }
    let (request, receiver) = broker.queue("mb_other", "observe", json!({})).unwrap();
    let legacy = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 0,
      "schemaVersion": 1, "ok": true, "result": {}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&legacy),
        Err(BrokerError::InvalidReply)
    );
    let wrong_version = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 0, "boardId": "mb_other",
      "schemaVersion": 1, "ok": true, "result": {}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&wrong_version),
        Err(BrokerError::StaleReply)
    );
    broker.cancel(&request.request_id);
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
}

#[test]
fn same_epoch_cannot_publish_a_different_active_board() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_a"))
        .unwrap();
    assert_eq!(
        broker.renderer_state("renderer-1", 4, true, Some("mb_b")),
        Err(BrokerError::StaleReply)
    );
    assert_eq!(broker.active_board_id().as_deref(), Some("mb_a"));
    broker
        .renderer_state("renderer-1", 4, false, Some("mb_a"))
        .unwrap();
    assert_eq!(
        broker.renderer_state("renderer-1", 4, true, Some("mb_b")),
        Err(BrokerError::StaleReply)
    );
    broker
        .renderer_state("renderer-1", 5, true, Some("mb_b"))
        .unwrap();
    assert_eq!(broker.active_board_id().as_deref(), Some("mb_b"));
}

#[test]
fn a_mutating_timeout_requires_readback_and_rejects_late_reply() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker
        .queue_with_timeout("mb_other", "create", json!({}), Duration::from_millis(2))
        .unwrap();
    std::thread::sleep(Duration::from_millis(20));
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_secs(1)),
        Err(BrokerError::ExecutionUnknown)
    );
    let late = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_other",
      "schemaVersion": 2, "ok": true, "result": {}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&late),
        Err(BrokerError::UnknownRequest)
    );
}

#[test]
fn matching_reply_completes_once_and_replay_is_rejected() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker.queue("mb_active", "observe", json!({})).unwrap();
    assert_eq!(request.method, "observe");
    assert_eq!(request.board_epoch, 4);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    assert!(request.expires_at_ms > now);
    assert!(request.expires_at_ms <= now + 10_000);
    let reply = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_active", "schemaVersion": 2,
      "ok": true, "result": {"stable": true}})
    .to_string();

    broker.accept_reply_json(&reply).unwrap();
    assert_eq!(
        receiver.recv().unwrap(),
        BoardReply::Success(json!({"stable": true}))
    );
    assert_eq!(
        broker.accept_reply_json(&reply),
        Err(BrokerError::UnknownRequest)
    );
}

#[test]
fn stale_epoch_reply_cannot_complete_a_request_and_state_change_cancels_it() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker
        .queue("mb_active", "create", json!({"spec": {"type": "rect"}}))
        .unwrap();
    let stale = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 3, "boardId": "mb_active", "schemaVersion": 2,
      "ok": true, "result": {}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&stale),
        Err(BrokerError::StaleReply)
    );
    broker
        .renderer_state("renderer-1", 5, true, Some("mb_active"))
        .unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::ExecutionUnknown);
}

#[test]
fn library_methods_and_oversized_requests_are_rejected() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    assert_eq!(
        broker.queue("mb_active", "boards.list", json!({})).err(),
        Some(BrokerError::UnsupportedMethod)
    );
    let oversized = "x".repeat(70_000);
    assert_eq!(
        broker
            .queue("mb_active", "create", json!({"spec": oversized}))
            .err(),
        Some(BrokerError::RequestTooLarge)
    );
}

#[test]
fn timeout_discards_the_pending_request_and_refuses_a_late_reply() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker.queue("mb_active", "observe", json!({})).unwrap();
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_millis(1)),
        Err(BrokerError::Timeout)
    );
    let late = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_active", "schemaVersion": 2,
      "ok": true, "result": {"stable": true}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&late),
        Err(BrokerError::UnknownRequest)
    );
}

#[test]
fn expired_request_rejects_a_reply_before_any_waiter_runs() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker
        .queue_with_timeout("mb_active", "observe", json!({}), Duration::from_millis(2))
        .unwrap();
    std::thread::sleep(Duration::from_millis(20));
    let late = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "boardId": "mb_active", "schemaVersion": 2,
      "ok": true, "result": {"stable": true}})
    .to_string();
    assert_eq!(broker.accept_reply_json(&late), Err(BrokerError::Timeout));
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_secs(1)),
        Err(BrokerError::Timeout)
    );
}

#[test]
fn await_deadline_starts_when_queued() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 4, true, Some("mb_active"))
        .unwrap();
    let (request, receiver) = broker
        .queue_with_timeout("mb_active", "observe", json!({}), Duration::from_millis(2))
        .unwrap();
    std::thread::sleep(Duration::from_millis(20));
    let start = std::time::Instant::now();
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_secs(1)),
        Err(BrokerError::Timeout)
    );
    assert!(start.elapsed() < Duration::from_millis(100));
}
