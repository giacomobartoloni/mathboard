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
fn matching_reply_completes_once_and_replay_is_rejected() {
    let broker = BoardRequestBroker::new("app-1");
    broker.renderer_state("renderer-1", 4, true).unwrap();
    let (request, receiver) = broker.queue("observe", json!({})).unwrap();
    assert_eq!(request.method, "observe");
    assert_eq!(request.board_epoch, 4);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    assert!(request.expires_at_ms > now);
    assert!(request.expires_at_ms <= now + 10_000);
    let reply = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "schemaVersion": 1,
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
    broker.renderer_state("renderer-1", 4, true).unwrap();
    let (request, receiver) = broker
        .queue("create", json!({"spec": {"type": "rect"}}))
        .unwrap();
    let stale = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 3, "schemaVersion": 1,
      "ok": true, "result": {}})
    .to_string();
    assert_eq!(
        broker.accept_reply_json(&stale),
        Err(BrokerError::StaleReply)
    );
    broker.renderer_state("renderer-1", 5, true).unwrap();
    assert_eq!(receiver.recv().unwrap(), BoardReply::Disconnected);
}

#[test]
fn library_methods_and_oversized_requests_are_rejected() {
    let broker = BoardRequestBroker::new("app-1");
    broker.renderer_state("renderer-1", 4, true).unwrap();
    assert_eq!(
        broker.queue("boards.list", json!({})).err(),
        Some(BrokerError::UnsupportedMethod)
    );
    let oversized = "x".repeat(70_000);
    assert_eq!(
        broker.queue("create", json!({"spec": oversized})).err(),
        Some(BrokerError::RequestTooLarge)
    );
}

#[test]
fn timeout_discards_the_pending_request_and_refuses_a_late_reply() {
    let broker = BoardRequestBroker::new("app-1");
    broker.renderer_state("renderer-1", 4, true).unwrap();
    let (request, receiver) = broker.queue("observe", json!({})).unwrap();
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_millis(1)),
        Err(BrokerError::Timeout)
    );
    let late = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "schemaVersion": 1,
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
    broker.renderer_state("renderer-1", 4, true).unwrap();
    let (request, receiver) = broker
        .queue_with_timeout("observe", json!({}), Duration::from_millis(2))
        .unwrap();
    std::thread::sleep(Duration::from_millis(20));
    let late = json!({"requestId": request.request_id, "appGeneration": "app-1",
      "rendererGeneration": "renderer-1", "boardEpoch": 4, "schemaVersion": 1,
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
    broker.renderer_state("renderer-1", 4, true).unwrap();
    let (request, receiver) = broker
        .queue_with_timeout("observe", json!({}), Duration::from_millis(2))
        .unwrap();
    std::thread::sleep(Duration::from_millis(20));
    let start = std::time::Instant::now();
    assert_eq!(
        broker.await_reply(&request.request_id, receiver, Duration::from_secs(1)),
        Err(BrokerError::Timeout)
    );
    assert!(start.elapsed() < Duration::from_millis(100));
}
