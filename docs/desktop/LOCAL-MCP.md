<!--
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Local MCP — Desktop (experimental)

The installed MathBoard desktop application contains a native-only MCP server. This is a **draft implementation**; installed client interoperability, Windows/native security acceptance, and installed-native shutdown acceptance are not yet verified.

## Enable and connect

Open **Local assistants → Local MCP settings…** in the installed desktop
application and turn the **Allow local MCP connections** switch **On**.
The one native switch enables all supported drawing, editing, screenshots
and board-library operations, including permanent deletion. There are no
per-board grants. MCP starts **Off** on each application launch unless
the user explicitly supplies `--mathboard-mcp-http`.

MathBoard tries the preferred loopback port `43179` first. If it is occupied,
MathBoard tries the next port, continuing through `65535` until it binds the
first available one. The listener always binds only to `127.0.0.1` and
serves `/mcp`. When the preferred port is free, the URL is:

```text
http://127.0.0.1:43179/mcp
```

**Always copy the active URL shown by Local MCP settings** into your local
Streamable HTTP MCP client. A fallback port changes the endpoint; client
configuration must be updated when that happens. No Bearer token, password
or custom HTTP header is required. Off → On creates a new session manager
and rescans from the preferred port, so the assigned URL can change.
Previously opened connections and sessions are closed or invalidated.

**Security tradeoff:** While MCP is enabled, any other application running
on this computer that can connect to localhost may read, modify or delete
local boards. Loopback does not authenticate the client process. Only enable
this for trusted local environments. A local MCP connection also does not
guarantee that a connected AI provider processes board data locally.

### Explicit HTTP startup from a CLI

To start the ordinary GUI with MCP already enabled:

```sh
mathboard --mathboard-mcp-http
```

The process emits one machine-readable JSON line on inherited stdout with
the **actual bound endpoint** (the preferred port when free):

```json
{"transport":"streamable-http","endpoint":"http://127.0.0.1:43179/mcp"}
```

The flag does not start a separate headless server, set up clients, or
create credentials. The existing CLI output contract requires available
stdout; failure to bind any available port at or above `43179`, or failure
to emit the record, shuts down and exits nonzero without propagating an
error through Tauri's macOS setup hook.
Installed macOS and Windows GUI launchers may not forward stdout; use
native settings in that case. A second instance cannot reconfigure the first.

The listener binds only to the selected `127.0.0.1:<port>` address and
only exposes `/mcp`. The admission gate and RMCP service both validate
the actual bound `Host` value; unexpected `Host` values and browser `Origin`
headers are rejected to
reduce browser-origin and DNS rebinding exposure. These checks **do not**
protect against a malicious local application. Request body and concurrent
connection limits remain in place. Switching Off invalidates outstanding
broker leases, closes RMCP sessions and stops the HTTP listener before
confirming Off. Data already delivered to OS buffers cannot be recalled.

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

After an `execution_unknown` response, re-read state before retrying a potentially committed mutation. Browser/renderer closure, unrelated board switches and native app exit can cancel in-flight work. When an MCP `boards.create`, `boards.open`, `boards.archive` or `boards.delete` request itself changes the active board, its bounded completion receipt is preserved across that transition, while other old-context requests are invalidated. MCP Off and renderer replacement always revoke that receipt.

## Local stdio companion (deferred)

The future, explicitly **unimplemented** stdio transport is documented in [STDIO-DRAFT.md](STDIO-DRAFT.md): process ownership, IPC link to the running GUI, stdout-only protocol, Off/revocation behavior and required installed acceptance. This draft is not a supported client configuration.

Only **Streamable HTTP** is supported for now. The `--mathboard-mcp-stdio` argument deliberately exits with a nonzero status and an stderr diagnostic; it does not start a second GUI. Unlike an in-process HTTP server, the stdio process is launched independently by a client. The native toggle cannot prove that the companion has stopped writing to stdout without a corresponding lifecycle handshake. The existing Unix IPC implementation remains in source but is not started by the GUI; Windows stdio is also unsupported. This is a deliberately fail-closed scope restriction, not a working stdio integration.

## Security and release status

This is a **source implementation, not verified release acceptance**. It protects browser Origins, Host, local TCP bind, strict Host/Origin admission, JSON-RPC request size and the native enable gate, and closes the HTTP runtime (including outstanding connection tasks) before acknowledging Off. Real installed-client tests must still verify response ordering for interrupted commands and screenshots. Do not call this secure for installed clients or mark Phase D complete until the output barrier and real native client/OS acceptance are verified. Earlier C2 installed-native acceptance remains owner-deferred, not passed.

See [PR #121](https://github.com/giacomobartoloni/mathboard/pull/121) for current implementation and CI. The application WebView carries no MCP settings or transport configuration.

## Native acceptance checklist (not yet executed)

For each installed Windows, macOS and Linux build, record exact application version, OS, client configuration and MCP traces:

1. While Off, verify no listener is bound. Enable MCP, initialize a Streamable HTTP client using the URL shown in native settings, list the tools and exercise observe, command, screenshot, board create/delete and library operations. Hold ports `43179` and `43180` with separate local listeners and verify GUI and explicit CLI startup use `43181` (or the first next-free port), show and copy that same actual endpoint, and enforce exact matching Host admission. Also launch a fresh desktop process with `--mathboard-mcp-http`; verify one valid endpoint-only JSON record on inherited stdout, native On state, and fail-closed stdout/unrecoverable bind errors.
2. Start concurrent long-running `tools/call` requests and screenshots using persistent HTTP clients. Switch Off: verify the toggle acknowledges only once active sockets have closed, with no further response bytes emitted by the server after acknowledgment. Previously delivered or kernel-buffered data cannot be withdrawn.
3. Switch On again: confirm a fresh session is required, old keep-alive connections cannot resume, and the displayed URL reflects any port reassignment. Check Host/Origin protection, idle connections, repeated On/Off, application exit and occupied-port fallback.
4. Interrupt a mutation and re-read state before retrying `execution_unknown`; do not automatically replay destructive operations.
5. Confirm the stdio argument exits nonzero without emitting a JSON-RPC frame.

Green source CI is not installed-native acceptance. These tests remain a release gate.
