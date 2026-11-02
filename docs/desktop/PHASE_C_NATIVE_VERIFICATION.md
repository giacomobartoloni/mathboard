# Phase C — Native verification probes (experimental)

**Status:** implementation only; no installed-app result claimed. Do not close Phase C until each supported platform has evidence in the existing AgentWorklog Activity.

## Safety

The Cargo feature `phase-c-verification` is absent from ordinary release builds. It installs no MCP endpoint and grants no access to the canvas. When explicitly enabled, it adds two independent probes:

- **Tauri bridge smoke**: a Rust worker calls the actual `emit_request()` method against the running WebView and checks `observe`, `create`, `createMany`, `measure`, PNG `screenshot`, and one native Undo for a batch. It **refuses to run on any identifier other than `app.mathboard.desktop.phasecsmoke`**. Reports contain only check labels and errors, not scene data or screenshot bytes.
- **Same-user IPC ping**: `MATHBOARD_PHASE_C_IPC_PROBE=1` starts a PING/PONG Unix socket on macOS/Linux or a local named pipe on Windows. The Unix directory is effective-UID-specific (`0700`, socket `0600`); the Windows pipe has an explicit user-SID DACL and rejects remote clients. A feature-only `--mathboard-companion-ping` CLI mode connects before the Tauri GUI starts. No board data is carried.

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

The feature-only Rust tests include native same-user cross-process PING/PONG and cleanup. Windows additionally tests endpoint exclusivity, peer identity checks, OS restricted-token access denial, malformed frames, idle clients, deadlines and cancellation of actual pending accept/read/write operations. A restricted token is **not another Windows account**. These tests do **not** prove an installed WebView operation, actual another-account denial or installed upgrade behavior.

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

## Run the Windows named-pipe feasibility trial

Use the feature-enabled isolated test package, with the ordinary smoke report variable unset so the GUI stays open. In PowerShell:

```powershell
$env:MATHBOARD_PHASE_C_IPC_PROBE = '1'
$installedExe = Join-Path $env:LOCALAPPDATA 'MathBoard Phase C Smoke\mathboard.exe'
Start-Process -FilePath $installedExe
```

In a second terminal, run the **same installed binary** with `--mathboard-companion-ping`; expect `mathboard-companion pong`, exit 0 and no second GUI. Because release builds use the Windows GUI subsystem, capture redirected output and the actual process exit code when recording CLI evidence; merely invoking an `.exe` in PowerShell is not enough to establish its exit status. Record the installed executable path, version, source revision/diff, SHA256, OS, WebView2 version and exact commands.

The endpoint is `\\.\pipe\mathboard-c-probe-v1-<OS-user-SID>`. Identity is derived from the process token, never USERNAME/USERPROFILE environment variables. A protected DACL allows that user and denies network identities; `PIPE_REJECT_REMOTE_CLIENTS` adds an explicit local-only restriction. The client checks the connected server's process-token SID before sending; the server checks the client's identification token from its actual pipe message. Processes belonging to the same user are within this probe's trust boundary; this is not product authorization or protection against an administrator taking control of the OS.

Windows frames are fixed/versioned `MATHBOARD-C-PROBE/1 PING` and `MATHBOARD-C-PROBE/1 PONG`, terminated by newline. The client acknowledges after consuming PONG, so normal disconnect does not discard unread output. Message lengths, per-operation waits and the client deadline are bounded; this is not a generic command channel. Shutdown signals cancellation and drains outstanding overlapped I/O before releasing buffers. The first pipe instance remains open between clients, preventing another server from replacing its name during a live session.

### Actual second-account denial

Keep the primary user's installed test app running with the probe enabled. Obtain that user's SID with `[Security.Principal.WindowsIdentity]::GetCurrent().User.Value`. In PowerShell under a **different standard Windows account**, run the following with that primary SID substituted. This uses built-in .NET so a denial caused by another user's private executable directory cannot be mistaken for pipe access control:

```powershell
$serverUserSid = 'REPLACE-WITH-PRIMARY-USER-SID'
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
if ($currentSid -eq $serverUserSid) { throw 'Use a different standard Windows account' }
$pipeName = 'mathboard-c-probe-v1-' + $serverUserSid
$client = New-Object IO.Pipes.NamedPipeClientStream('.', $pipeName, [IO.Pipes.PipeDirection]::InOut)
try {
    $client.Connect(2000)
    throw 'FAIL: another account connected to the pipe'
} catch [UnauthorizedAccessException] {
    'PASS: Windows denied access to the pipe'
} finally {
    $client.Dispose()
}
```

A timeout or pipe-not-found is **inconclusive**, not access-denied evidence. Verify a same-user ping immediately before and after this trial to establish that the endpoint was live. Record actual account separation and OS error; do not log passwords or treat an elevated administrator's ability to override OS security as the standard-user case. Arrange account creation/access with the owner rather than silently provisioning credentials.

### Lifecycle and installed-package matrix

- App absent: ping fails promptly without starting a GUI.
- Normal app close: the explicit Tauri Exit hook shuts down the server; subsequent ping fails.
- Restart: the old connection becomes unusable and a fresh companion connects to the new instance. Repeated old shutdown/Drop must not remove the new server.
- Idle, partial/malformed or disconnected client: it cannot hold the single pipe instance indefinitely or permanently stop accepting new clients.
- Crash/forced termination: Windows releases server handles; confirm a restart works and old clients fail safely. Distinguish this trial from normal quit.
- Actual installed upgrade/reinstall: record old/new package identity, path, version and cleanup, then repeat the same-user and closed-app checks. A same-version reinstall alone does not prove a version upgrade.

The Windows transport is implemented for this feature-only probe, but its feasibility gate remains open until the actual installed-account/security/lifecycle matrix is evidenced. Source tests do not waive these requirements. Normal packages must omit `phase-c-verification` and must not start a probe even if the environment variable is present.

## Remaining release criteria

A successful local `cargo test` or `--no-bundle` CI is **not** enough. Run the installed-app bridge smoke and IPC tests on macOS/Windows/Linux, validate actual save/reopen in IndexedDB, observe native timeout/late reply and lifecycle teardown behavior, and record cross-user denial and restart/upgrade cleanup. Never claim completion for missing platform evidence.
