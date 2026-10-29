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

use app_lib::board_bridge::BoardRequestBroker;
use app_lib::mcp_ipc_protocol::{
    IpcCommand, IpcReply, read_command, read_frame, read_reply, write_frame, write_reply,
};
use serde_json::json;
use std::io::Cursor;

fn framed(value: serde_json::Value) -> Vec<u8> {
    let mut bytes = Vec::new();
    write_frame(&mut bytes, &value, 64 * 1024).unwrap();
    bytes
}

#[test]
fn versioned_ipc_accepts_only_catalog_and_three_read_calls() {
    assert!(matches!(
        read_command(&mut Cursor::new(framed(
            json!({"version":1,"operation":"catalog"})
        )))
        .unwrap(),
        IpcCommand::Catalog
    ));
    let command = read_command(&mut Cursor::new(framed(json!({"version":1,"operation":"read","name":"mathboard_measure","arguments":{"boardId":"mb_a","id":"obj_1"}})))).unwrap();
    assert!(
        matches!(command, IpcCommand::Read(call) if call.method() == "measure" && call.board_id() == Some("mb_a"))
    );
    for value in [
        json!({"version":2,"operation":"catalog"}),
        json!({"version":1,"operation":"read","name":"mathboard_create","arguments":{}}),
        json!({"version":1,"operation":"read","name":"mathboard_observe","arguments":{"method":"clear"}}),
        json!({"version":1,"operation":"catalog","name":"mathboard_observe"}),
        json!({"version":1,"operation":"catalog","name":null,"arguments":null,"lease":null}),
        json!({"version":1,"operation":"read","name":"mathboard_observe","arguments":{},"lease":null}),
    ] {
        assert!(read_command(&mut Cursor::new(framed(value))).is_err());
    }
}

#[test]
fn length_prefix_rejects_oversize_before_payload_allocation() {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&(65_537u32).to_be_bytes());
    assert!(read_frame(&mut Cursor::new(bytes), 64 * 1024).is_err());
    assert!(write_frame(&mut Vec::new(), &json!({"x":"a".repeat(70_000)}), 64 * 1024).is_err());
}

#[test]
fn lease_check_frame_retains_app_generated_identity() {
    let broker = BoardRequestBroker::new("app-1");
    broker
        .renderer_state("renderer-1", 1, true, Some("mb_a"))
        .unwrap();
    broker.mcp_set_enabled(true);
    let (_, _, lease) = broker.queue_mcp_read(None, "observe", json!({})).unwrap();
    let command = read_command(&mut Cursor::new(framed(
        json!({"version":1,"operation":"check","lease":lease}),
    )))
    .unwrap();
    assert!(matches!(command, IpcCommand::Check(ref received) if broker.mcp_lease_valid(received)));
    let command = read_command(&mut Cursor::new(framed(
        json!({"version":1,"operation":"release","lease":lease}),
    )))
    .unwrap();
    assert!(
        matches!(command, IpcCommand::Release(ref received) if broker.mcp_lease_valid(received))
    );
}

#[test]
fn reply_frame_keeps_json_bounded_and_explicitly_typed() {
    let mut bytes = Vec::new();
    write_reply(
        &mut bytes,
        &IpcReply::Catalog {
            methods: vec!["observe".into(), "measure".into()],
        },
    )
    .unwrap();
    assert!(
        matches!(read_reply(&mut Cursor::new(bytes)).unwrap(), IpcReply::Catalog { methods } if methods == ["observe", "measure"])
    );
    let mut bytes = Vec::new();
    assert!(
        write_reply(
            &mut bytes,
            &IpcReply::ReadPng {
                data: "x".repeat(7 * 1024 * 1024),
                lease: {
                    let broker = BoardRequestBroker::new("app-1");
                    broker
                        .renderer_state("renderer-1", 1, true, Some("mb_a"))
                        .unwrap();
                    broker.mcp_set_enabled(true);
                    broker.queue_mcp_read(None, "observe", json!({})).unwrap().2
                }
            }
        )
        .is_err()
    );
    assert!(bytes.is_empty());
}
