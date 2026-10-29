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
use serde_json::Value;
use std::borrow::Cow;
use std::future::Future;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpReadError {
    Unavailable,
    PermissionDenied,
    BoardContextChanged,
    BoardBusy,
    CaptureTooLarge,
    Internal,
}

impl McpReadError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Unavailable => "mcp_unavailable",
            Self::PermissionDenied => "permission_denied",
            Self::BoardContextChanged => "board_context_changed",
            Self::BoardBusy => "board_busy",
            Self::CaptureTooLarge => "capture_too_large",
            Self::Internal => "internal_error",
        }
    }
}

pub enum McpReadOutput {
    Json(Value),
    Png(Vec<u8>),
}

impl McpReadOutput {
    pub fn into_result(self) -> CallToolResult {
        let result = match self {
            Self::Json(value) => CallToolResult::structured(value),
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
                spec.name
                    .strip_prefix("mathboard_")
                    .is_some_and(|method| visible.contains(&method))
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
        let receipt = match self.backend.read(call).await {
            Ok(receipt) => receipt,
            Err(error) => {
                return Ok(CallToolResult::error(vec![ContentBlock::text(
                    error.code(),
                )]));
            }
        };
        let result = receipt.output.into_result();
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
