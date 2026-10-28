# Phase C — Native verification probes (experimental)

**Status:** implementation only; no installed-app result claimed. Do not close Phase C until each supported platform has evidence in the existing AgentWorklog Activity.

## Safety

The Cargo feature `phase-c-verification` is absent from ordinary release builds. It installs no MCP endpoint and grants no access to the canvas. When explicitly enabled, it adds two independent probes:

- **Tauri bridge smoke**: a Rust worker calls the actual `emit_request()` method against the running WebView and checks `observe`, `create`, `createMany`, `measure`, PNG `screenshot`, and one native Undo for a batch. It **refuses to run on any identifier other than `app.mathboard.desktop.phasecsmoke`**. Reports contain only check labels and errors, not scene data or screenshot bytes.
- **Same-user IPC ping**: on macOS/Linux only, `MATHBOARD_PHASE_C_IPC_PROBE=1` starts a PING/PONG Unix socket under an effective-UID-specific directory (`0700` and socket `0600`). A feature-only `--mathboard-companion-ping` CLI mode connects before the Tauri GUI starts. No board data is carried. Windows named pipe is **not yet implemented**.

## CI/source checks

```sh
npm ci
npm run lint
npm run test:unit
npm run test:agent-bridge
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --features phase-c-verification
```

The feature-only Rust tests include same-user cross-process PING/PONG on macOS/Linux, owner/mode checks and socket cleanup. These tests do **not** prove any installed WebView operation or another-user denial.

## Launch a native Tauri bridge smoke

Use a **separate test profile** and a feature-enabled build. Never execute a mutating smoke against the production app profile.

```sh
MATHBOARD_PHASE_C_SMOKE_REPORT=/tmp/mathboard-phase-c-smoke.json \
  npm run desktop:dev -- --features phase-c-verification \
  --config src-tauri/tauri.phase-c-smoke.conf.json
```

The application exits when the driver completes; inspect the JSON report. A report with `status=passed` proves the native-to-WebView path on the actual runtime that was executed, not full persistence/reopen or installed release packaging. On Windows choose a report path appropriate for that OS. For an installed-app gate, build and install the isolated profile with `npm run desktop:build -- --features phase-c-verification --config src-tauri/tauri.phase-c-smoke.conf.json`, run its installed executable with the report environment variable, and record the path, package version, OS and WebView version. Production releases must omit the feature.

## Run the companion feasibility trial (macOS/Linux)

Launch the same feature-enabled test app with **only** `MATHBOARD_PHASE_C_IPC_PROBE=1`, without a smoke report path. In another terminal, run the same test binary with `--mathboard-companion-ping`; expect `mathboard-companion pong` and exit 0, with no second GUI. Verify no connection when the app is closed, denial from another OS account, stale socket cleanup on restart, and behavior after an upgraded installation. Tauri's `RunEvent::Exit` explicitly shuts down the probe and unlinks the Unix socket during a normal application exit (managed state `Drop` alone is not sufficient). A forced process kill, crash, or abrupt `desktop:dev` shutdown can bypass the exit event; an owned stale socket is safely recovered on next start, and its prior existence is not proof of a live listener.

After **quitting the application normally from its application menu** (not force-quitting or stopping Vite/Tauri with Ctrl+C), confirm the socket pathname is absent:

```sh
SOCKET="/tmp/mathboard-c-probe-$(id -u)/companion.sock"
if [ -S "$SOCKET" ]; then
  echo "FAIL: stale socket remains"
else
  echo "PASS: no socket"
fi
```

Run `--mathboard-companion-ping` while the app is open (expect `mathboard-companion pong`) and after closing it (expect failure without a new GUI). If the socket persists after a **normal app quit**, record the exit method and report it as a failure rather than deleting the file or claiming the cleanup gate passed.

**Windows:** the feature explicitly reports the named-pipe probe as unsupported. Its feasibility gate remains open until an OS-user-restricted named-pipe trial or a documented security-reviewed transport fallback is implemented and tested.

## Remaining release criteria

A successful local `cargo test` or `--no-bundle` CI is **not** enough. Run the installed-app bridge smoke and IPC tests on macOS/Windows/Linux, validate actual save/reopen in IndexedDB, observe native timeout/late reply and lifecycle teardown behavior, and record cross-user denial and restart/upgrade cleanup. Never claim completion for missing platform evidence.
