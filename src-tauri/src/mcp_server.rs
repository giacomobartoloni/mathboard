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

//! MCP protocol adapter. A separate backend owns app IPC and final authorization.

use crate::mcp_contract::{ToolCall, ToolCallError, parse_tool_call, tool_specs};
use base64::Engine;
use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ProtocolVersion, ServerCapabilities, ServerConfig,
        Tool,
    },
    service::RequestContext,
};
use serde_json::{Map, Value, json};
use std::borrow::Cow;
use std::future::Future;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpReadError {
    Unavailable,
    PermissionDenied,
    BoardContextChanged,
    BoardBusy,
    InvalidToolArguments,
    ExecutionUnknown,
    CaptureTooLarge,
    Domain(&'static str),
    Internal,
}

impl McpReadError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Unavailable => "mcp_unavailable",
            Self::PermissionDenied => "permission_denied",
            Self::BoardContextChanged => "board_context_changed",
            Self::BoardBusy => "board_busy",
            Self::InvalidToolArguments => "invalid_tool_arguments",
            Self::ExecutionUnknown => "execution_unknown",
            Self::CaptureTooLarge => "capture_too_large",
            Self::Domain(code) => code,
            Self::Internal => "internal_error",
        }
    }

    /// Only static, allowlisted messages and codes are exposed to clients.
    /// Never forward untrusted renderer error text or local file paths.
    pub fn into_result(self) -> CallToolResult {
        let payload = json!({
            "code": self.code(),
            "message": match self {
                Self::Domain("invalid_object_spec") => "Invalid object specification.",
                Self::Domain("invalid_object_patch") => "Invalid object update.",
                Self::Domain("object_not_found") => "Object not found.",
                Self::Domain("board_not_found") => "Board not found.",
                Self::Domain("board_archived") => "Board is archived.",
                Self::Domain("board_not_archived") => "Board is not archived.",
                Self::Domain("invalid_board_title") => "Invalid board title.",
                Self::Domain("edit_in_progress") => "Editing is in progress.",
                Self::Domain("nested_object_mutation_not_supported") => "Nested object mutation is unsupported.",
                Self::Domain("invalid_capture_request") => "Invalid capture request.",
                Self::Domain("formula_render_failed") => "Formula rendering failed.",
                Self::Domain("board_commit_failed") => "Board save failed; re-observe before retrying.",
                _ => "MathBoard could not complete the request.",
            },
        });
        let mut result = CallToolResult::error(vec![ContentBlock::text(payload.to_string())]);
        result.structured_content = Some(payload);
        result
    }
}

pub enum McpReadOutput {
    Json(Value),
    Png(Vec<u8>),
}

impl McpReadOutput {
    pub fn into_result(self) -> CallToolResult {
        self.into_result_for(None)
    }

    pub fn into_result_for(self, method: Option<&str>) -> CallToolResult {
        let result = match self {
            Self::Json(value) => {
                // MCP 2025-11-25 requires object-shaped structuredContent.
                // Preserve the original JSON text for older consumers.
                let plain_text = value.to_string();
                let key = match method {
                    Some("createMany") => "objects",
                    Some("deleteMany" | "clear") => "removed",
                    Some("boards.list" | "boards.listArchived") => "boards",
                    _ => "items",
                };
                let structured = match value {
                    Value::Object(_) => value,
                    Value::Array(_) => {
                        let mut envelope = Map::new();
                        envelope.insert(key.to_owned(), value);
                        Value::Object(envelope)
                    }
                    other => json!({ "value": other }),
                };
                let mut result = CallToolResult::structured(structured);
                result.content = vec![ContentBlock::text(plain_text)];
                result
            },
            Self::Png(bytes) if bytes.len() <= 5 * 1024 * 1024 => {
                CallToolResult::success(vec![ContentBlock::image(
                    base64::engine::general_purpose::STANDARD.encode(bytes),
                    "image/png",
                )])
            }
            _ => return CallToolResult::error(vec![ContentBlock::text("capture_too_large")]),
        };
        // Reserve space for the JSON-RPC envelope and a bounded request ID.
        if serde_json::to_vec(&result).is_ok_and(|wire| wire.len() <= 7 * 1024 * 1024 - 128 * 1024)
        {
            result
        } else {
            CallToolResult::error(vec![ContentBlock::text("result_too_large")])
        }
    }
}

pub struct McpReadReceipt<L> {
    pub output: McpReadOutput,
    pub lease: L,
}

pub trait McpReadBackend: Clone + Send + Sync + 'static {
    type Lease: Send + Sync;
    fn visible_methods(&self) -> impl Future<Output = Vec<&'static str>> + Send;
    fn read(
        &self,
        call: ToolCall,
    ) -> impl Future<Output = Result<McpReadReceipt<Self::Lease>, McpReadError>> + Send;
    fn lease_valid(&self, lease: &Self::Lease) -> impl Future<Output = bool> + Send;
    fn release_lease(&self, lease: Self::Lease) -> impl Future<Output = ()> + Send {
        let _ = lease;
        async {}
    }
}

#[derive(Clone)]
pub struct MathBoardMcpServer<B: McpReadBackend> {
    backend: B,
}

impl<B: McpReadBackend> MathBoardMcpServer<B> {
    pub fn new(backend: B) -> Self {
        Self { backend }
    }

    pub async fn catalog(&self) -> Vec<Tool> {
        let visible = self.backend.visible_methods().await;
        tool_specs()
            .iter()
            .filter(|spec| {
                match spec.name.as_str() {
                    "mathboard_observe" => visible.contains(&"observe"),
                    "mathboard_measure" => visible.contains(&"measure"),
                    "mathboard_screenshot" => visible.contains(&"screenshot"),
                    _ => visible.contains(&"command"),
                }
            })
            .map(|spec| {
                Tool::new(
                    spec.name.clone(),
                    spec.description.clone(),
                    spec.input_schema.clone(),
                )
            })
            .collect()
    }

    pub async fn dispatch(&self, name: &str, arguments: Value) -> Result<CallToolResult, McpError> {
        if name == "mathboard_help" {
            if !self.backend.visible_methods().await.contains(&"command") {
                return Ok(McpReadError::PermissionDenied.into_result());
            }
            let Some(args) = arguments.as_object() else {
                return Err(McpError::invalid_params("Invalid help arguments", None));
            };
            if args.len() > 1 || args.keys().any(|key| key != "method") {
                return Err(McpError::invalid_params("Invalid help arguments", None));
            }
            let method = match args.get("method") {
                None => None,
                Some(Value::String(method)) => Some(method.as_str()),
                _ => return Err(McpError::invalid_params("Invalid help method", None)),
            };
            let output = discovery_help(method)
                .ok_or_else(|| McpError::invalid_params("Unknown help method", None))?;
            return Ok(McpReadOutput::Json(output).into_result());
        }
        let call = parse_tool_call(name, arguments).map_err(|error| match error {
            ToolCallError::UnknownTool => McpError::invalid_params("Unknown tool", None),
            ToolCallError::InvalidArguments => {
                McpError::invalid_params("Invalid tool arguments", None)
            }
        })?;
        if !self
            .backend
            .visible_methods()
            .await
            .contains(&call.method())
        {
            return Ok(CallToolResult::error(vec![ContentBlock::text(
                McpReadError::PermissionDenied.code(),
            )]));
        }
        let result_method = if call.method() == "command" {
            call.params()
                .get("method")
                .and_then(Value::as_str)
                .map(str::to_owned)
        } else {
            Some(call.method().to_owned())
        };
        let receipt = match self.backend.read(call).await {
            Ok(receipt) => receipt,
            Err(error) => return Ok(error.into_result()),
        };
        let result = receipt.output.into_result_for(result_method.as_deref());
        if !self.backend.lease_valid(&receipt.lease).await {
            self.backend.release_lease(receipt.lease).await;
            return Ok(CallToolResult::error(vec![ContentBlock::text(
                McpReadError::PermissionDenied.code(),
            )]));
        }
        if result.is_error == Some(true) {
            self.backend.release_lease(receipt.lease).await;
        }
        Ok(result)
    }
}

fn discovery_help(method: Option<&str>) -> Option<Value> {
    let help: Value = serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/mathboard-mcp-help.json"))).ok()?;
    let methods = help.get("methods")?.as_array()?;
    match method {
        Some(method) => {
            let descriptor = methods.iter().find(|entry| entry["method"] == method)?;
            Some(json!({"schemaVersion":help["schemaVersion"],"schemaDialect":help["schemaDialect"],
                "method":descriptor,"objectTypes":help["objectTypes"],
                "patchSchemas":help["patchSchemas"],"examplesByType":help["examplesByType"]}))
        }
        None => Some(json!({"schemaVersion":help["schemaVersion"],"transport":help["transport"],
            "methods":methods.iter().map(|entry| json!({"method":entry["method"],
                "summary":entry["summary"],"mutatesBoard":entry["mutatesBoard"]})).collect::<Vec<_>>() })),
    }
}

impl<B: McpReadBackend> ServerHandler for MathBoardMcpServer<B> {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("mathboard", env!("CARGO_PKG_VERSION")))
    }

    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Owned(vec![
            ProtocolVersion::V_2026_07_28,
            ProtocolVersion::V_2025_11_25,
        ])
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult {
            tools: self.catalog().await,
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        if request.input_responses.is_some() || request.request_state.is_some() {
            return Err(McpError::invalid_params(
                "Unsupported tool continuation",
                None,
            ));
        }
        self.dispatch(
            &request.name,
            Value::Object(request.arguments.unwrap_or_default()),
        )
        .await
        .map(Into::into)
    }
}
