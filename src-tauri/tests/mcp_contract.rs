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

use app_lib::mcp_contract::{
    ScreenshotError, ToolCallError, decode_screenshot, parse_tool_call, tool_specs,
};
use serde_json::json;

#[test]
fn only_three_typed_read_tools_reach_the_bridge() {
    assert_eq!(
        tool_specs()
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<Vec<_>>(),
        [
            "mathboard_observe",
            "mathboard_measure",
            "mathboard_screenshot"
        ]
    );
    let observe = parse_tool_call("mathboard_observe", json!({})).unwrap();
    assert_eq!(observe.method(), "observe");
    assert_eq!(observe.board_id(), None);
    assert_eq!(observe.params(), json!({}));
    let measure =
        parse_tool_call("mathboard_measure", json!({"boardId":"mb_a","id":"obj_1"})).unwrap();
    assert_eq!(measure.method(), "measure");
    assert_eq!(measure.board_id(), Some("mb_a"));
    assert_eq!(measure.params(), json!({"id":"obj_1"}));
    for name in [
        "mathboard_create",
        "boards.list",
        "observe",
        "mathboard_help",
    ] {
        assert_eq!(
            parse_tool_call(name, json!({})).err(),
            Some(ToolCallError::UnknownTool)
        );
    }
}

#[test]
fn board_target_and_unknown_fields_are_rejected_at_mcp_edge() {
    for args in [
        json!({"boardId":"mb_bad!"}),
        json!({"boardId":"mb_a","method":"create"}),
        json!({"boardId":null}),
    ] {
        assert_eq!(
            parse_tool_call("mathboard_observe", args).err(),
            Some(ToolCallError::InvalidArguments)
        );
    }
    for args in [
        json!({"id":"obj_1"}),
        json!({"boardId":"mb_a","id":""}),
        json!({"boardId":"mb_a","id":"obj_1","confirm":true}),
    ] {
        assert_eq!(
            parse_tool_call("mathboard_measure", args).err(),
            Some(ToolCallError::InvalidArguments)
        );
    }
}

#[test]
fn screenshot_contract_accepts_bounded_targets_and_rejects_invalid_options() {
    let call = parse_tool_call(
        "mathboard_screenshot",
        json!({"boardId":"mb_a","target":{"kind":"viewport"}}),
    )
    .unwrap();
    assert_eq!(
        call.params(),
        json!({"target":{"kind":"viewport"},"scale":1.0,"format":"png"})
    );
    for args in [
        json!({"boardId":"mb_a"}),
        json!({"boardId":"mb_a","target":{"kind":"viewport","ids":["x"]}}),
        json!({"boardId":"mb_a","target":{"kind":"sceneRect","rect":{"x":0,"y":0,"width":0,"height":1}}}),
        json!({"boardId":"mb_a","target":{"kind":"objectIds","ids":["x","x"]}}),
        json!({"boardId":"mb_a","target":{"kind":"objectIds","ids":["\u{FEFF}"]}}),
        json!({"boardId":"mb_a","target":{"kind":"viewport"},"scale":4}),
        json!({"boardId":"mb_a","target":{"kind":"viewport"},"format":"jpg"}),
    ] {
        assert_eq!(
            parse_tool_call("mathboard_screenshot", args.clone()).err(),
            Some(ToolCallError::InvalidArguments),
            "accepted {args}"
        );
    }
    assert!(
        parse_tool_call(
            "mathboard_screenshot",
            json!({"boardId":"mb_a","target":{"kind":"objectIds","ids":["\u{0085}"]}})
        )
        .is_ok()
    );
}

fn tiny_png() -> Vec<u8> {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[0, 0, 0, 255]).unwrap();
    }
    bytes
}

#[test]
fn screenshot_decoder_checks_payload_and_declared_dimensions() {
    use base64::Engine;
    let bytes = tiny_png();
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let result = json!({"mimeType":"image/png","encoding":"base64","data":encoded,
        "widthPx":1,"heightPx":1,"boardId":"mb_a","observationVersion":1,
        "scale":1,"region":{"kind":"viewport","coordinateSpace":"viewport"}});
    assert_eq!(decode_screenshot(&result, "mb_a").unwrap(), bytes);
    assert_eq!(
        decode_screenshot(&result, "mb_b").err(),
        Some(ScreenshotError::InvalidImage)
    );
    let mut wrong = result.clone();
    wrong["widthPx"] = json!(2);
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::InvalidImage)
    );
    wrong = result.clone();
    wrong["data"] = json!("not base64");
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::InvalidImage)
    );
    wrong = result.clone();
    wrong["widthPx"] = json!(2049);
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::TooLarge)
    );
    wrong = result.clone();
    let mut corrupt = bytes.clone();
    let last = corrupt.len() - 1;
    corrupt[last] ^= 0xff;
    wrong["data"] = json!(base64::engine::general_purpose::STANDARD.encode(corrupt));
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::InvalidImage)
    );
    wrong = result.clone();
    let mut trailing = bytes.clone();
    trailing.extend_from_slice(b"private-sentinel");
    wrong["data"] = json!(base64::engine::general_purpose::STANDARD.encode(trailing));
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::InvalidImage)
    );
    wrong = result.clone();
    let mut animated = bytes.clone();
    animated.splice(33..33, [0, 0, 0, 0, b'a', b'c', b'T', b'L', 0, 0, 0, 0]);
    wrong["data"] = json!(base64::engine::general_purpose::STANDARD.encode(animated));
    assert_eq!(
        decode_screenshot(&wrong, "mb_a").err(),
        Some(ScreenshotError::InvalidImage)
    );
}
