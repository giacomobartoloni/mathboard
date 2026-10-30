# 0011. Use the RMCP transport lifecycle for local desktop MCP

- Status: Proposed (PR #121, not yet merged)
- Date: 2026-10-29
- Amended: 2026-10-30 (owner-directed URL-only local setup)

## Context

MathBoard offers full supported board operations through a native-only,
loopback MCP server. The shared web board must not own MCP permissions or
transport state. A broker lease alone cannot stop an already open HTTP
response stream.

The first implementation required an activation-scoped Bearer token
on every MCP On. The owner chose a Penpot-like local UX with a stable URL
and no token or custom header, superseding that admission decision. This
is an explicit change to the local security trust model.

## Decision

The dedicated Tauri settings window owns one accessible On/Off switch.

- **Off by default:** no listener or active RMCP sessions, except when
  the user explicitly launches with `--mathboard-mcp-http`.
- **On:** bind `127.0.0.1:43179`, start the official `rmcp` Streamable
  HTTP service at `/mcp`, and enable the native broker. Binding conflicts
  fail closed.
- **Admission:** require native On, exact Host, absent browser Origin,
  bounded request size and connection limits; no per-client HTTP token.
- **Off:** invalidate pending operations/leases; cancel the RMCP
  `CancellationToken`; join the Tokio runtime and active Hyper writers
  before acknowledging disable. A later On creates a new session manager.
- **CLI:** `--mathboard-mcp-http` runs the same native server and emits
  a one-line JSON record containing only transport and endpoint. Keep the
  existing stdout-failure rollback and clean nonzero startup exit to
  preserve the 2026-10-30 occupied-port panic fix. Installed launcher
  behavior remains an acceptance gate.
- **Native UX:** implement an accessible switch with explicit state text;
  show only the stable URL, never an authorization header.
- **Stdio:** remain unavailable while separately launched companion
  writers cannot be reliably stopped by the native Off boundary. Unix
  production IPC remains disabled and Windows stdio unsupported.

## Security consequences

While On, **any application able to reach the local loopback port may
read, edit or delete boards**, without identifying itself to MathBoard.
Host/Origin checks reduce browser-origin and DNS-rebinding threats, not
malicious local processes. Native On/Off is the sole permission gate.
Domain validation and `boards.delete`'s `confirm:true` remain intact.
Do not bind on non-loopback interfaces or present this as a remote/cloud
MCP authentication scheme.

This consciously trades away local client admission compared with the
earlier Bearer model. Reconsider if stronger local isolation becomes
a product requirement; do not claim localhost provides process identity.

## Lifecycle and verification

Off closes admitted connections but cannot recall bytes already delivered
to OS buffers. Clients keep the same configuration URL, but need a new
MCP session after re-enabling. Interrupted writes may return
`execution_unknown` and require state inspection, not automatic retries.

Preserve the bounded completion receipt for same-renderer
`boards.create/open/archive/delete` transitions and explicit CLI
clean failure implemented at PR head `2e0ad63` on 2026-10-30.
MCP Off and renderer replacement still revoke any outstanding receipt.
Neither new local UX nor source CI proves installed release acceptance:
retake the owner's macOS `boards.create` and occupied-port tests, then
verify real native clients, Host/Origin defenses, and concurrent
disable/response emission on supported OSes.

## Deferred stdio design

See [desktop/STDIO-DRAFT.md](../desktop/STDIO-DRAFT.md) for an
unimplemented companion. Do not add an alternate board engine or
custom output fence without verified need.

## Alternatives considered

- Activation-scoped token: rejected for repeated manual configuration.
- Persistent token: avoids rotation but retains an unnecessary credential
  workflow under the selected local-trust model.
- Listening while Off: rejected because open streams could emit results.
- Partially supported stdio: rejected until reliable companion shutdown.

## Related decisions

- ADR 0009: Tauri desktop shell.
- ADR 0005: board persistence and unknown-outcome writes.
- [PR #121](https://github.com/giacomobartoloni/mathboard/pull/121).
