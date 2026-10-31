# Phase D0 RMCP stdio probe

This isolated binary validates the exact pinned RMCP release against synthetic
modern and legacy MCP requests. It has one fixed tool, `mathboard_probe`, and no
MathBoard app connection, board read, grant, IPC endpoint or production entrypoint.

```sh
cargo build --manifest-path tools/phase-d-probe/Cargo.toml --release --locked
python3 tools/phase-d-probe/verify.py
```

The fixture checks `server/discover`, legacy `initialize`, `tools/list`, a fixed
`tools/call`, a 64 KiB input limit, malformed input under inherited
`RUST_LOG=trace`, clean stderr, input EOF and a closed output pipe. It runs a
direct subprocess on the current OS. It also verifies an unsupported modern
protocol version is rejected with a JSON-RPC error. It does not establish client
launch, installed package paths, dynamic tool-list refresh, grant revocation,
image memory budgets or cross-user security. See the D0 feasibility report in
`AgentWorklog/mathboard/Specs/` for evidence and unresolved decisions.

On Windows use `py -3 tools/phase-d-probe/verify.py` after the same Cargo build.
The fixture invokes the console-subsystem probe binary from its build directory;
it does not test the installed MathBoard GUI executable's stdio inheritance.
