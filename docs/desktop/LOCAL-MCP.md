<!--
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Local MCP — Desktop (experimental)

The installed MathBoard desktop application contains a native-only MCP server. This is a **draft implementation**; installed client interoperability, Windows/native security acceptance, and confirmed-disable response emission are not yet verified.

## Enable and connect

Open the native desktop application's **Local assistants → Local MCP settings…** menu and turn **Allow local connections** **On**. This is the only product permission: it enables every currently supported MCP tool, including modifications and permanent deletion. No per-board or screenshot grants exist. MCP starts **Off** on every MathBoard launch. Switching boards does not turn it off.

The native settings window displays:

- Endpoint: `http://127.0.0.1:43179/mcp`
- HTTP header: `Authorization: Bearer <the session token shown in settings>`

Use these values in an MCP client that supports **Streamable HTTP** and custom request headers. The endpoint is bound only to IPv4 loopback and is not remotely accessible. The token is generated anew at each desktop launch and is **not saved**. After restart, update the client's header. Do not put the token into project files, public logs, URL query parameters, or the web board.

Browser `Origin` headers are deliberately rejected; this interface is for trusted desktop MCP clients, not scripts hosted on websites. Hostnames other than `127.0.0.1:43179` are rejected to reduce DNS rebinding risk. Requests require the token even while MCP is enabled; the token is connection authentication, **not a second user permission**. If the port is already in use, the server does not start and the native toggle fails closed.

## Tools

The external tool names are `mathboard_observe`, `mathboard_measure`, `mathboard_screenshot`, and `mathboard_command`.

`mathboard_command` accepts an existing command name and its parameters:

```json
{
  "method": "create",
  "boardId": "mb_example",
  "params": {
    "spec": { "type": "text", "text": "x = 2", "left": 200, "top": 140 }
  }
}
```

The allowlist is the canonical MathBoard board command registry: `create`, `createMany`, `update`, `delete`, `deleteMany`, `clear`, `group`, `layout`, `boards.list`, `boards.create`, `boards.open`, `boards.rename`, `boards.listArchived`, `boards.archive`, `boards.unarchive`, and `boards.delete`. No arbitrary WebView script, Tauri `invoke`, file-system tool or remote MCP operation is exposed. Existing domain validation still applies: `boards.delete` requires `params.confirm: true`.

To work with a non-active board, pass its `boardId` for document operations supported by the detached board executor. Library commands use `params.boardId` where required by the shared workspace service; an outer `boardId` selects the board context for routing. No **permission** is limited to the active board, but screenshot capture still requires a live renderer, and viewport layout of an inactive board may be unavailable. These are execution limitations.

After an `execution_unknown` response, re-read state before retrying a potentially committed mutation. Browser/renderer closure, explicit board switches and native app exit can cancel in-flight work.

## Local stdio companion

The same installed desktop executable can also be started with `--mathboard-mcp-stdio` by a desktop MCP client instead of opening a GUI. This mode uses the official `rmcp` stdio transport and the existing private native IPC adapter. It requires a separately running MathBoard GUI instance. The Unix native IPC adapter is implemented; Windows stdio companion IPC is **not yet implemented** and fails closed. Stdout contains only MCP protocol frames, not diagnostics.

## Security and release status

This is a **source implementation, not verified release acceptance**. It protects browser Origins, Host, local TCP bind, token admission, JSON-RPC request size and the native enable gate, but the **final response-emission fence across confirmed disable** remains to be demonstrated. Do not call this secure for installed clients or mark Phase D complete until the output barrier and real native client/OS acceptance are verified. Earlier C2 installed-native acceptance remains owner-deferred, not passed.

See [PR #121](https://github.com/giacomobartoloni/mathboard/pull/121) for current implementation and CI. The application WebView carries no MCP settings or transport configuration.
