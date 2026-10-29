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

//! Versioned one-message IPC framing. The platform transport must enforce peer identity and deadlines.

use crate::board_bridge::McpReadLease;
use crate::mcp_contract::{ToolCall, parse_tool_call};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, Read, Write};

pub const REQUEST_LIMIT: usize = 64 * 1024;
pub const REPLY_LIMIT: usize = 7 * 1024 * 1024;
const WIRE_VERSION: u32 = 1;

pub enum IpcCommand {
    Catalog,
    Read(ToolCall),
    Check(McpReadLease),
    Release(McpReadLease),
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IpcReply {
    Catalog { methods: Vec<String> },
    ReadJson { value: Value, lease: McpReadLease },
    ReadPng { data: String, lease: McpReadLease },
    Check { valid: bool },
    Released,
    Error { code: String },
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireRequest {
    version: u32,
    operation: String,
    name: Option<String>,
    arguments: Option<Value>,
    lease: Option<McpReadLease>,
}

fn invalid_data() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "invalid MCP IPC frame")
}

pub fn read_frame(reader: &mut impl Read, maximum: usize) -> io::Result<Vec<u8>> {
    let mut prefix = [0u8; 4];
    reader.read_exact(&mut prefix)?;
    let length = u32::from_be_bytes(prefix) as usize;
    if length == 0 || length > maximum {
        return Err(invalid_data());
    }
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body)?;
    Ok(body)
}

pub fn write_frame(writer: &mut impl Write, value: &Value, maximum: usize) -> io::Result<()> {
    let body = serde_json::to_vec(value).map_err(|_| invalid_data())?;
    if body.is_empty() || body.len() > maximum || body.len() > u32::MAX as usize {
        return Err(invalid_data());
    }
    writer.write_all(&(body.len() as u32).to_be_bytes())?;
    writer.write_all(&body)
}

pub fn write_reply(writer: &mut impl Write, reply: &IpcReply) -> io::Result<()> {
    let value = serde_json::to_value(reply).map_err(|_| invalid_data())?;
    write_frame(writer, &value, REPLY_LIMIT)
}

pub fn read_reply(reader: &mut impl Read) -> io::Result<IpcReply> {
    let body = read_frame(reader, REPLY_LIMIT)?;
    serde_json::from_slice(&body).map_err(|_| invalid_data())
}

pub fn read_command(reader: &mut impl Read) -> io::Result<IpcCommand> {
    let body = read_frame(reader, REQUEST_LIMIT)?;
    let raw: Value = serde_json::from_slice(&body).map_err(|_| invalid_data())?;
    let object = raw.as_object().ok_or_else(invalid_data)?;
    let keys: &[&str] = match object.get("operation").and_then(Value::as_str) {
        Some("catalog") => &["version", "operation"],
        Some("read") => &["version", "operation", "name", "arguments"],
        Some("check") => &["version", "operation", "lease"],
        Some("release") => &["version", "operation", "lease"],
        _ => return Err(invalid_data()),
    };
    if object.len() != keys.len() || !keys.iter().all(|key| object.contains_key(*key)) {
        return Err(invalid_data());
    }
    let request: WireRequest = serde_json::from_slice(&body).map_err(|_| invalid_data())?;
    if request.version != WIRE_VERSION {
        return Err(invalid_data());
    }
    match (
        request.operation.as_str(),
        request.name,
        request.arguments,
        request.lease,
    ) {
        ("catalog", None, None, None) => Ok(IpcCommand::Catalog),
        ("read", Some(name), Some(arguments), None) => parse_tool_call(&name, arguments)
            .map(IpcCommand::Read)
            .map_err(|_| invalid_data()),
        ("check", None, None, Some(lease)) => Ok(IpcCommand::Check(lease)),
        ("release", None, None, Some(lease)) => Ok(IpcCommand::Release(lease)),
        _ => Err(invalid_data()),
    }
}
