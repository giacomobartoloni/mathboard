<!--
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Local MCP — Desktop (experimental)

The installed MathBoard desktop application contains a native-only MCP server. This is a **draft implementation**; installed client interoperability, Windows/native security acceptance, and installed-native shutdown acceptance are not yet verified.

## Enable and connect

Open the native desktop application's **Local assistants → Local MCP settings…** menu and turn **Allow local connections** **On**. This is the only product permission: it enables every currently supported MCP tool, including modifications and permanent deletion. No per-board or screenshot grants exist. MCP starts **Off** by default on every MathBoard launch, except when the user explicitly supplies `--mathboard-mcp-http`. Switching boards does not turn it off.

The native settings window displays:

- Endpoint: `http://127.0.0.1:43179/mcp`
- HTTP header: `Authorization: Bearer <the session token shown in settings>`

Use these values in an MCP client that supports **Streamable HTTP** and custom request headers. The endpoint is bound only to IPv4 loopback and is not remotely accessible. The token is generated anew on every **MCP On**, including Off → On without restarting MathBoard, and is **not saved**. After each activation, update the client's header and initialize a new MCP session. Do not put the token into project files, public logs, URL query parameters, or the web board.

### Explicit HTTP startup from a CLI

An operator may launch the **desktop application itself** with `--mathboard-mcp-http` to start with the normal native MCP switch already **On**:

```sh
mathboard --mathboard-mcp-http
```

This starts the regular GUI and the same loopback HTTP transport used by the settings toggle. After the listener is bound and the broker is enabled, the process writes **one JSON line to inherited stdout**:

```json
{"transport":"streamable-http","endpoint":"http://127.0.0.1:43179/mcp","token":"<new-random-activation-token>"}
```

The client still needs an `Authorization: Bearer <token>` HTTP header; the flag does **not** configure clients, embed credentials in the process arguments, or run a headless MCP server. The token is newly generated at this activation, is also visible in the native settings window, and is never stored by MathBoard. If the port cannot be bound or the token record cannot be written and flushed, startup fails closed. After switching Off and On, the original printed token is invalid; retrieve the newly rotated token from native settings.

Run this only from a trusted launcher that handles the token as a secret: stdout redirection, terminal transcripts, CI logs and shell history of *captured output* may disclose it. MathBoard does not intentionally send this record to stderr or system logs. **Console availability depends on the launcher:** macOS `open -a` normally does not forward the app's stdout to the calling shell, and packaged Windows GUI executables may not have an attached stdout handle. On those launch paths use the native settings window; test and document installed CLI/stdout behavior separately for each OS. Running a second application instance with this flag does not reconfigure an already running instance; a port conflict remains fail-closed.

Browser `Origin` headers are deliberately rejected; this interface is for trusted desktop MCP clients, not scripts hosted on websites. Hostnames other than `127.0.0.1:43179` are rejected to reduce DNS rebinding risk. Requests require the token even while MCP is enabled; the token is connection authentication, **not a second user permission**. The HTTP port is not bound while MCP is Off. If it is already in use when switching On, the toggle fails closed. On Off, broker requests and sessions are cancelled and active HTTP sockets close before confirmation. Bytes already handed to the operating system cannot be recalled.

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

## Local stdio companion (deferred)

The future, explicitly **unimplemented** stdio transport is documented in [STDIO-DRAFT.md](STDIO-DRAFT.md): process ownership, IPC link to the running GUI, stdout-only protocol, Off/revocation behavior and required installed acceptance. This draft is not a supported client configuration.

Only **Streamable HTTP** is supported for now. The `--mathboard-mcp-stdio` argument deliberately exits with a nonzero status and an stderr diagnostic; it does not start a second GUI. Unlike an in-process HTTP server, the stdio process is launched independently by a client. The native toggle cannot prove that the companion has stopped writing to stdout without a corresponding lifecycle handshake. The existing Unix IPC implementation remains in source but is not started by the GUI; Windows stdio is also unsupported. This is a deliberately fail-closed scope restriction, not a working stdio integration.

## Security and release status

This is a **source implementation, not verified release acceptance**. It protects browser Origins, Host, local TCP bind, token admission, JSON-RPC request size and the native enable gate, and closes the HTTP runtime (including outstanding connection tasks) before acknowledging Off. Real installed-client tests must still verify response ordering for interrupted commands and screenshots. Do not call this secure for installed clients or mark Phase D complete until the output barrier and real native client/OS acceptance are verified. Earlier C2 installed-native acceptance remains owner-deferred, not passed.

See [PR #121](https://github.com/giacomobartoloni/mathboard/pull/121) for current implementation and CI. The application WebView carries no MCP settings or transport configuration.

## Native acceptance checklist (not yet executed)

For each installed Windows, macOS and Linux build, record exact application version, OS, client configuration and MCP traces:

1. While Off, verify the port is unbound. Enable MCP, initialize a Streamable HTTP client, list the tools and exercise observe, command, screenshot, board create/delete and library operations. Also launch a fresh desktop process with `--mathboard-mcp-http`; verify one valid JSON token record on inherited stdout, port binding, visible native On state, matching settings token, invalid old tokens and fail-closed port/stdout errors.
2. Start concurrent long-running `tools/call` requests and screenshots using persistent HTTP clients. Switch Off: verify the toggle acknowledges only once active sockets have closed, with no further response bytes emitted by the server after acknowledgment. Previously delivered or kernel-buffered data cannot be withdrawn.
3. Switch On again: confirm a new token and new session are required; old keep-alive connections cannot resume. Check Host/Origin/token protection, idle connections, repeated On/Off, application exit and port conflicts.
4. Interrupt a mutation and re-read state before retrying `execution_unknown`; do not automatically replay destructive operations.
5. Confirm the stdio argument exits nonzero without emitting a JSON-RPC frame.

Green source CI is not installed-native acceptance. These tests remain a release gate.
