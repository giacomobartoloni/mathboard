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

//! The closed MCP input surface. No client-provided method reaches the native bridge.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::HashSet;
use std::io::Cursor;
use std::sync::OnceLock;

const MAX_ARGUMENT_BYTES: usize = 64 * 1024;
const MAX_SCENE_OBJECTS: usize = 2000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallError {
    UnknownTool,
    InvalidArguments,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScreenshotError {
    InvalidImage,
    TooLarge,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub input_schema: Map<String, Value>,
}

pub fn tool_specs() -> &'static [ToolSpec] {
    static SPECS: OnceLock<Vec<ToolSpec>> = OnceLock::new();
    SPECS
        .get_or_init(|| {
            serde_json::from_str(include_str!("../resources/mcp-tool-schemas.json"))
                .expect("checked MCP tool schema artifact")
        })
        .as_slice()
}

#[derive(Debug, Clone, PartialEq)]
pub struct ToolCall {
    method: &'static str,
    board_id: Option<String>,
    params: Value,
}

impl ToolCall {
    pub fn method(&self) -> &'static str {
        self.method
    }
    pub fn board_id(&self) -> Option<&str> {
        self.board_id.as_deref()
    }
    pub fn params(&self) -> Value {
        self.params.clone()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ObserveArgs {
    board_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MeasureArgs {
    board_id: String,
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ScreenshotArgs {
    board_id: String,
    target: CaptureTarget,
    #[serde(default = "default_scale")]
    scale: f64,
    #[serde(default = "default_format")]
    format: String,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum CaptureTarget {
    SceneRect {
        rect: CaptureRect,
    },
    ObjectIds {
        ids: Vec<String>,
        #[serde(default = "default_padding")]
        padding: f64,
    },
    Viewport,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct CaptureRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn default_scale() -> f64 {
    1.0
}
fn default_padding() -> f64 {
    16.0
}
fn default_format() -> String {
    "png".to_owned()
}

fn valid_board_id(id: &str) -> bool {
    id.len() > 3
        && id.len() <= 131
        && id.starts_with("mb_")
        && id[3..]
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn valid_capture_target(target: &CaptureTarget) -> bool {
    match target {
        CaptureTarget::SceneRect { rect } => {
            [
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                rect.x + rect.width,
                rect.y + rect.height,
            ]
            .iter()
            .all(|n| n.is_finite())
                && rect.width > 0.0
                && rect.height > 0.0
        }
        CaptureTarget::ObjectIds { ids, padding } => {
            ids.len() > 0
                && ids.len() <= MAX_SCENE_OBJECTS
                && padding.is_finite()
                && (0.0..=128.0).contains(padding)
                && ids
                    .iter()
                    .all(|id| id.chars().any(|ch| !ecmascript_whitespace(ch)))
                && ids.iter().collect::<HashSet<_>>().len() == ids.len()
        }
        CaptureTarget::Viewport => true,
    }
}

fn ecmascript_whitespace(ch: char) -> bool {
    matches!(ch,
        '\u{0009}'..='\u{000D}' | '\u{0020}' | '\u{00A0}' | '\u{1680}'
        | '\u{2000}'..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}'
        | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

fn keys_within(value: &Value, allowed: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|object| object.keys().all(|key| allowed.contains(&key.as_str())))
}

fn valid_capture_shape(value: Option<&Value>) -> bool {
    let Some(target) = value else {
        return false;
    };
    match target.get("kind").and_then(Value::as_str) {
        Some("viewport") => keys_within(target, &["kind"]),
        Some("sceneRect") => {
            keys_within(target, &["kind", "rect"])
                && target
                    .get("rect")
                    .is_some_and(|rect| keys_within(rect, &["x", "y", "width", "height"]))
        }
        Some("objectIds") => keys_within(target, &["kind", "ids", "padding"]),
        _ => false,
    }
}

pub fn parse_tool_call(name: &str, arguments: Value) -> Result<ToolCall, ToolCallError> {
    let method = match name {
        "mathboard_observe" => "observe",
        "mathboard_measure" => "measure",
        "mathboard_screenshot" => "screenshot",
        _ => return Err(ToolCallError::UnknownTool),
    };
    if !arguments.is_object()
        || serde_json::to_vec(&arguments)
            .map_err(|_| ToolCallError::InvalidArguments)?
            .len()
            > MAX_ARGUMENT_BYTES
    {
        return Err(ToolCallError::InvalidArguments);
    }
    if arguments.get("boardId") == Some(&Value::Null) {
        return Err(ToolCallError::InvalidArguments);
    }
    let invalid = |_| ToolCallError::InvalidArguments;
    let call = match method {
        "observe" => {
            let args: ObserveArgs = serde_json::from_value(arguments).map_err(invalid)?;
            if args
                .board_id
                .as_deref()
                .is_some_and(|id| !valid_board_id(id))
            {
                return Err(ToolCallError::InvalidArguments);
            }
            ToolCall {
                method,
                board_id: args.board_id,
                params: json!({}),
            }
        }
        "measure" => {
            let args: MeasureArgs = serde_json::from_value(arguments).map_err(invalid)?;
            if !valid_board_id(&args.board_id) || args.id.is_empty() {
                return Err(ToolCallError::InvalidArguments);
            }
            ToolCall {
                method,
                board_id: Some(args.board_id),
                params: json!({"id":args.id}),
            }
        }
        "screenshot" => {
            if !valid_capture_shape(arguments.get("target")) {
                return Err(ToolCallError::InvalidArguments);
            }
            let args: ScreenshotArgs = serde_json::from_value(arguments).map_err(invalid)?;
            if !valid_board_id(&args.board_id)
                || !args.scale.is_finite()
                || !(0.5..=3.0).contains(&args.scale)
                || args.format != "png"
                || !valid_capture_target(&args.target)
            {
                return Err(ToolCallError::InvalidArguments);
            }
            ToolCall {
                method,
                board_id: Some(args.board_id),
                params: json!({"target":args.target,"scale":args.scale,"format":"png"}),
            }
        }
        _ => unreachable!(),
    };
    Ok(call)
}

/** Decode one trusted bridge result only after bounding the encoded and decoded image. */
pub fn decode_screenshot(
    result: &Value,
    expected_board_id: &str,
) -> Result<Vec<u8>, ScreenshotError> {
    const MAX_PNG_BYTES: usize = 5 * 1024 * 1024;
    const MAX_BASE64_CHARS: usize = 4 * MAX_PNG_BYTES.div_ceil(3);
    let error = ScreenshotError::InvalidImage;
    if result.get("mimeType").and_then(Value::as_str) != Some("image/png")
        || result.get("encoding").and_then(Value::as_str) != Some("base64")
        || result.get("boardId").and_then(Value::as_str) != Some(expected_board_id)
        || result.get("observationVersion").and_then(Value::as_u64) != Some(1)
        || !result.get("region").is_some_and(Value::is_object)
        || !result
            .get("scale")
            .and_then(Value::as_f64)
            .is_some_and(|n| n.is_finite() && (0.5..=3.0).contains(&n))
    {
        return Err(error);
    }
    let width = result.get("widthPx").and_then(Value::as_u64).ok_or(error)?;
    let height = result
        .get("heightPx")
        .and_then(Value::as_u64)
        .ok_or(error)?;
    if width == 0 || height == 0 {
        return Err(error);
    }
    if width > 2048 || height > 2048 || width * height > 2_097_152 {
        return Err(ScreenshotError::TooLarge);
    }
    let encoded = result.get("data").and_then(Value::as_str).ok_or(error)?;
    if encoded.len() > MAX_BASE64_CHARS {
        return Err(ScreenshotError::TooLarge);
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| error)?;
    if bytes.len() > MAX_PNG_BYTES {
        return Err(ScreenshotError::TooLarge);
    }
    if bytes.len() < 24
        || bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10]
        || bytes[8..12] != [0, 0, 0, 13]
        || &bytes[12..16] != b"IHDR"
    {
        return Err(error);
    }
    let png_width = u32::from_be_bytes(bytes[16..20].try_into().map_err(|_| error)?) as u64;
    let png_height = u32::from_be_bytes(bytes[20..24].try_into().map_err(|_| error)?) as u64;
    if png_width != width || png_height != height {
        return Err(error);
    }
    if !static_png_chunks(&bytes) {
        return Err(error);
    }
    let mut decoder = png::Decoder::new(Cursor::new(&bytes));
    decoder.set_limits(png::Limits {
        bytes: 16 * 1024 * 1024,
    });
    let mut reader = decoder.read_info().map_err(|_| error)?;
    if reader.info().width as u64 != width || reader.info().height as u64 != height {
        return Err(error);
    }
    let output_size = reader.output_buffer_size().ok_or(error)?;
    if output_size > 8 * 1024 * 1024 {
        return Err(ScreenshotError::TooLarge);
    }
    let mut pixels = vec![0; output_size];
    reader.next_frame(&mut pixels).map_err(|_| error)?;
    reader.finish().map_err(|_| error)?;
    Ok(bytes)
}

fn static_png_chunks(bytes: &[u8]) -> bool {
    let mut offset = 8usize;
    let mut seen_idat = false;
    let mut first = true;
    loop {
        let Some(header_end) = offset.checked_add(12) else {
            return false;
        };
        if header_end > bytes.len() {
            return false;
        }
        let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let Some(end) = header_end.checked_add(length) else {
            return false;
        };
        if end > bytes.len() {
            return false;
        }
        let kind = &bytes[offset + 4..offset + 8];
        if first && (kind != b"IHDR" || length != 13) {
            return false;
        }
        if matches!(kind, b"acTL" | b"fcTL" | b"fdAT") {
            return false;
        }
        if kind == b"IDAT" {
            seen_idat = true;
        }
        if kind == b"IEND" {
            return length == 0 && seen_idat && end == bytes.len();
        }
        offset = end;
        first = false;
    }
}
