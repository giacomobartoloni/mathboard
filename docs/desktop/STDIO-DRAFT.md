<!--
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Draft — Native MCP stdio companion (not implemented)

- **Status:** Draft / deferred. This file describes a possible future transport, **not** a supported way to connect to MathBoard.
- **Current support:** Only native **Streamable HTTP**, documented in [LOCAL-MCP.md](LOCAL-MCP.md).
- **Existing entrypoint:** `--mathboard-mcp-stdio` intentionally prints an error to stderr and exits nonzero; it emits no MCP protocol frames.
- **Revisit only if:** A relevant trusted local MCP client cannot use Streamable HTTP, and there is real demand to support it.

## Background: what stdio actually means

A client launches a child process and sends MCP JSON-RPC messages over that process's **stdin**. The child sends only protocol frames over **stdout**. Diagnostic text goes exclusively to **stderr**. No TCP port, HTTP token or HTTP listener is inherently involved in stdio.

A stdio child is **not** the MathBoard desktop GUI and must never instantiate a second independent board model. It can only act as a thin protocol adapter to the one already running, authorized native app.

## Proposed minimal architecture

```text
Trusted local MCP client
    | stdin / stdout (client owns companion process)
    v
mathboard --mathboard-mcp-stdio       [future; currently rejects launch]
    | authenticated local native IPC (exact mechanism TBD)
    v
Running MathBoard Tauri desktop app
    | one MCP On/Off broker gate, board leases and existing services
    v
BoardDocumentCommandService / BoardWorkspaceService / screenshot adapter
```

### Constraints for a future implementation

1. **One permission switch:** The desktop application's native MCP **On/Off** remains authoritative for both transports. Stdio must not silently enable MCP, create a second permission model, or expose a second editable board store. The explicit HTTP startup flag `--mathboard-mcp-http` is **not** a stdio flag.
2. **Process ownership:** The client starts and usually stops its own companion. The GUI controls authorization and must not assume that closing a GUI window also terminates independently launched children.
3. **Local IPC trust:** A future bridge must authenticate or otherwise safely establish the app/peer identity and deny cross-user callers. Existing Unix-socket code is retained as historical implementation material but no longer started in production; Windows IPC remains unsolved. Reuse audited Rust dispatch, typed contracts, bounds and board services; do not add a parallel engine.
4. **Clean streams:** Standard output contains only MCP protocol frames, not status, logging or banner text. Errors/logging go to stderr. Stdio does **not** use the HTTP endpoint. IPC peer identity and authorization must be handled independently of the HTTP URL-only trust model.
5. **Disable/revocation:** On native Off, new commands and leases are immediately invalidated. Before claiming Off complete, prove that every supported companion can no longer emit **new** protocol results from an already admitted command. Mere lease checks do not establish an output barrier; stdout already written to the OS cannot be recalled. Prefer an existing SDK/OS process shutdown mechanism over a custom `BeginEmit/FenceAck` protocol. If no minimal reliable mechanism exists, **do not enable stdio**.
6. **Mutating calls:** If cancellation, an app switch or a disconnected companion interrupts a command that might have committed, the caller must treat the outcome as unknown and read back before retrying; a connection close is not an undo.
7. **Resource limits:** Maintain bounded request sizes, concurrent calls and screenshot responses; fail closed when the target GUI app or its single permission gate is absent.

## Open decisions (deliberately unanswered)

- How will the GUI identify and stop every live, independently launched companion without adding substantial cross-process orchestration?
- Which Unix socket or other same-user IPC authentication can be verified on supported macOS/Linux versions? What is the equivalent Windows mechanism?
- How will installed client launchers on Windows package and invoke a console-capable companion without GUI stdout pitfalls?
- Is there enough real client demand to justify supporting a second transport at all?

## Acceptance before changing status to supported

- [ ] Reproduce an actual stdio-only client need and record the tested client/OS versions.
- [ ] Run installed `initialize`, `tools/list`, `tools/call`, screenshot and board mutation tests with stdout protocol purity and stderr-only diagnostics.
- [ ] Confirm Off blocks future calls and closes or fences all already-running companion response writers **before** native Off acknowledgment; test interrupted JSON and multi-megabyte screenshot output.
- [ ] Verify app exit, companion exit, client EOF, multiple clients, stale subprocesses and fast Off → On cycles.
- [ ] Prove same-user/peer admission, request limits, and Windows/macOS/Linux native transport behavior.
- [ ] Validate unknown-outcome mutation semantics and fail-closed behavior when the app is Off or absent.
- [ ] Update [ADR 0011](../adr/0011-native-local-mcp-lifecycle.md), current desktop documentation, source tests and installed acceptance evidence.

**Do not infer that a runnable stdio companion exists from source files, the D0 synthetic stdio probe, or this draft.**
