# 0011. Use the RMCP transport lifecycle for local desktop MCP

- Status: Proposed (PR #121, not yet merged)
- Date: 2026-10-29

## Context

MathBoard exposes full supported board/document and board-library operations through
a native-only, same-machine MCP integration. The shared Vue board must not own
MCP permissions, credentials, or transport state. A request/lease epoch alone
does not close already established HTTP streams or the stdout of separately
launched stdio companion processes.

## Decision

The dedicated native settings WebView owns a single MCP On/Off control.

- **Off by default:** no TCP listener, active RMCP sessions or HTTP token
  exists until native activation.
- **On:** bind `127.0.0.1:43179`, initialize official `rmcp` Streamable HTTP,
  generate an activation-scoped token and then enable broker operations.
  Port conflicts fail closed; the only exposed endpoint is `/mcp`.
- **Off:** first invalidate broker operations/leases; cancel the RMCP
  `CancellationToken`; then join the transport runtime thread. Tokio drops
  all remaining Hyper connection tasks when the runtime terminates. Only
  acknowledge Off after the join completes. A later On constructs a new
  listener, RMCP session manager and bearer token.
- **Admission:** preserve loopback-only binding, exact Host, absent Origin,
  bearer-token authentication, size and connection limits. The token is
  client admission, not an independent user permission.
- **Stdio:** do not launch `--mathboard-mcp-stdio` until the separately
  launched companion can terminate its response writer before native Off is
  confirmed. The entrypoint exits nonzero. Disable the unused Unix production
  IPC listener while this mode is deferred; Windows stdio remains unsupported.

Use the SDK and normal OS transport lifecycle, without an additional
`BeginEmit`/`FenceAck` application protocol unless verified interoperability
tests establish a concrete missing guarantee.

## Consequences

The listener no longer occupies the loopback port while Off, and clients
must reconnect and reinitialize with a new token after Off/On. A potentially
committed write interrupted by shutdown is not safe to automatically replay:
`execution_unknown` still requires state inspection.

Joining an exited transport runtime proves its application writers have
stopped, but cannot recall bytes already transferred into kernel buffers or
received by clients. The native toggle must not claim to erase delivered data.

The source-only Rust tests and GitHub CI are necessary but do not replace
installed real-client acceptance of long-running calls, persistent connections,
screenshots, client token rotation, Host/Origin rules and concurrent shutdown
on Windows/macOS/Linux.

## Alternatives considered

- **Leave HTTP listening while Off and check permission on each request:**
  rejected, because existing streams can continue to emit results.
- **Custom per-response output fencing over IPC:** deferred under YAGNI while
  standard RMCP cancellation and transport shutdown are being verified.
- **Keep partially supported stdio companion enabled:** rejected because a
  separate process is not stopped by the GUI HTTP cancellation token.

## Related decisions

- ADR 0009: Tauri as thin desktop shell.
- ADR 0005: document persistence and unknown-outcome implications.
- [PR #121](https://github.com/giacomobartoloni/mathboard/pull/121).
