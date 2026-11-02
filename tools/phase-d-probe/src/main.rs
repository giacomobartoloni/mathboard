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
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler, ServiceExt,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ProtocolVersion, ServerCapabilities, ServerConfig,
        Tool,
    },
    service::RequestContext,
};
use serde_json::{Map, Value, json};
use std::borrow::Cow;

#[derive(Clone)]
struct Probe;

impl ServerHandler for Probe {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("mathboard-phase-d-probe", "0.1.0"))
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
        let schema: Map<String, Value> =
            json!({"type":"object","properties":{},"additionalProperties":false})
                .as_object()
                .unwrap()
                .clone();
        Ok(ListToolsResult {
            tools: vec![Tool::new(
                "mathboard_probe",
                "Returns a fixed synthetic value.",
                schema,
            )],
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, McpError> {
        if request.name != "mathboard_probe" {
            return Ok(CallToolResult::error(vec![ContentBlock::text("unknown_tool")]).into());
        }
        Ok(CallToolResult::success(vec![ContentBlock::text("mathboard-probe-ok")]).into())
    }
}

#[tokio::main]
async fn main() {
    let (stdin, stdout) = rmcp::transport::stdio_pipes();
    let transport =
        rmcp::transport::async_rw::AsyncRwTransport::<RoleServer, _, _>::new(stdin, stdout)
            .with_max_line_length(64 * 1024);
    if let Ok(server) = Probe.serve(transport).await {
        let _ = server.waiting().await;
    }
}
