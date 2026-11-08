# Desktop development

MathBoard's desktop application is a Tauri 2 host for the existing Vue and Vite
frontend. It uses the same source and production `dist/` output as the web application.

## Prerequisites

- Node.js 22 and npm
- The stable Rust toolchain installed with [rustup](https://rustup.rs/)
- Platform build tools:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Microsoft C++ Build Tools with the Desktop development with C++ workload,
    plus WebView2 where it is not already supplied by Windows
  - Ubuntu 22.04:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

The `libwebkit2gtk-4.1-dev` package is required by Tauri 2; older Tauri 1 examples
using WebKitGTK 4.0 are not applicable.

## Run locally

```sh
npm ci
npm run desktop:info
npm run desktop:dev
```

`desktop:dev` starts Vite at `http://localhost:5173` through Tauri's configured
`beforeDevCommand`, then opens the native window. Browser-only development remains
available with `npm run dev`.

## Build

```sh
npm run lint
npm run build
npm run desktop:build
```

Tauri invokes `npm run build` itself before compiling and bundling. Use the explicit
web build above when reproducing CI or checking the frontend independently. To compile
the native application without creating installers:

```sh
npm run desktop:build -- --no-bundle
```

## Desktop CI policy

The [Desktop CI workflow](../../.github/workflows/desktop.yml) is separate from
the main [web CI workflow](../../.github/workflows/main.yml):

- Every PR targeting `main` or `develop` runs a lightweight changed-file check.
  The Linux, Windows, and macOS native build matrix runs only when the PR changes
  `src-tauri/`, `src/platform/`, `src/analytics/`, `package.json`,
  `package-lock.json`, `.node-version`, `vite.config.js`, or the desktop
  CI/release workflow definitions.
- Regular pushes do not trigger Desktop CI. The main CI still checks lint,
  unit tests, production web build, and browser/agent E2E on pushes and PRs.
- Every night at 02:17 UTC, the desktop matrix compiles the current `develop`
  revision on all three platforms. GitHub Actions reads scheduled workflow
  definitions from the default branch (`main`), so this schedule becomes
  active once the workflow change also reaches `main`. The scheduled job
  explicitly checks out `develop`.
- `workflow_dispatch` provides a full desktop matrix on the selected branch.
  A release tag (`desktop-v*`) is handled by
  [Desktop Release Candidate](../../.github/workflows/release-desktop.yml),
  which builds installers independently of the no-bundle CI.
- Rust compilation dependencies are cached per runner OS. The Linux job checks Rust formatting and all three platforms run locked
  native Rust unit tests.
- Tauri invokes `npm run build` through `beforeBuildCommand`; the desktop
  workflow does not repeat a separate web build or lint step.

The nightly builds detect integration regressions in shared frontend changes
that do not independently trigger native compilation on PRs. Before shipping,
perform the installed-app and offline checks in [TEST_MATRIX.md](TEST_MATRIX.md);
a passing `--no-bundle` compile is not a packaged-app acceptance test.
## Board bridge harness

The desktop runtime connects `src/platform/desktopBoardBridge.js` after the board
session is ready; the web build never loads it. The adapter exposes only the 11 canvas
methods in `src/board/agent/desktop-commands.js` (`observe`, `measure`, `screenshot`,
`create`, `createMany`, `update`, `delete`, `deleteMany`, `clear`, `group`, `layout`).
The Vite-only development bridge keeps its 19-method help and is not part of `dist/`.

Run the harness and native broker tests before changing the bridge:

```sh
npm run test:agent-bridge   # Vite agent mode + e2e-agent/, includes board lifecycle races
npm run assert:no-e2e-hook  # fails if development instrumentation leaks into dist/
cd src-tauri && cargo test --locked && cargo fmt --check
```

Rust accepts correlated replies only from WebView `main` through
`src-tauri/capabilities/board-bridge.json`. The native bridge uses schema version 2:
every request and reply carries a top-level persistent `boardId` as well as the
request ID, app and renderer generations, and board epoch. A target must be named
explicitly when trusted native code queues a request. The browser checks its
existence and revision before editing; inactive targets run in a detached Fabric
context and commit through IndexedDB revision CAS. `screenshot` and `layout` require
the active board. A timed-out write may have committed, so `execution_unknown`
requires readback of that board before another write. The Vite-only development
bridge keeps its existing command shape and is not an addressed native client.
For example, an internal native request has this envelope; the correlated reply
must echo `boardId`, `requestId`, both generations, `boardEpoch`, and `schemaVersion`:

```json
{"requestId":"app-1","appGeneration":"app","rendererGeneration":"renderer","boardEpoch":2,"boardId":"mb_example","schemaVersion":2,"expiresAtMs":1793200000000,"method":"observe","params":{}}
```

Phase C3 has no MCP listener: `--mathboard-companion-version` only proves the
packaged binary can dispatch a companion mode before Tauri starts its GUI.

## Troubleshooting

- Run `npm run desktop:info` first to inspect the detected Rust, Node, WebView, and
  platform dependencies.
- If Linux cannot find WebKitGTK, confirm that the installed development package is
  `libwebkit2gtk-4.1-dev` and that `pkg-config` can resolve it.
- If Windows compilation cannot find a linker, install the MSVC C++ workload and start
  a new terminal.
- If the desktop window cannot reach Vite, check that port 5173 is free and that no
  stale Vite process is still running.
- If an external link does not open, it must match the capability allowlist:
  `https://*` or `mailto:*`.
- On the web, Privacy Policy uses same-origin `/privacy-policy.html`. In the desktop
  app it opens `https://mathboard.app/privacy-policy.html` in the system browser
  through the scoped opener, so that link requires network access.
- If CSP blocks a new resource, update the narrow directives in
  `src-tauri/tauri.conf.json`; do not disable the CSP.

The existing BoardDocument workflow persists board data in IndexedDB and supports
save/open and autosave (ADR 0005); the command-log undo/redo history remains in
memory. Session-scoped active board identity may be lost across a full application
restart, so verify saved-board access and recovery on each native platform rather
than assuming the last scratch board automatically reopens. UI preferences may
persist independently through `localStorage`.

## Packaged native MCP Plot smoke (F039 G4.4)

The Desktop CI workflow has an **opt-in** Linux packaged-app acceptance job.
On GitHub, open **Actions → Desktop CI → Run workflow**, select the
`feat/f039-agent-mcp-plots` branch and enable `native_mcp_smoke`. The
equivalent GitHub CLI command is:

```sh
gh workflow run desktop.yml --repo giacomobartoloni/mathboard \
  --ref feat/f039-agent-mcp-plots -f native_mcp_smoke=true
```

The job builds a real Linux `.deb` with Tauri (not `--no-bundle`), installs
it into an ephemeral runner, launches the GUI under Xvfb and a private D-Bus
session, and connects using a pinned `@modelcontextprotocol/sdk@1.32.2`
Streamable HTTP client. It uses the documented native
`--mathboard-mcp-http` startup flag and reads the actual endpoint from stdout.
The board database and process home are isolated under the runner's temporary
directory; a disposable board is removed after the tests.

The smoke covers native discovery, empty-board PNG control, Plot create and
semantic readback, **Plot-containing PNG capture**, edit and visual-change PNG,
and durable readback plus capture after a full application restart. PNG files,
sanitized startup logs, package SHA-256 and structured PASS/FAIL test results
are retained as a GitHub artifact for 14 days. A failed assertion fails the
job; the test never substitutes the development bridge or a mock MCP server.
A transient SDK package is installed in a separate temporary directory, not
added to the application's dependency tree.

For PRs targeting `develop` or `main`, the packaged smoke is triggered
automatically when the diff touches the smoke harness/workflow, Plot engine,
public board agent contract, capture/observation/persistence, desktop bridge,
Graph/board integration, native MCP runtime or relevant build configuration.
Unrelated web-only changes stay on lightweight CI. Scheduled Desktop CI still
runs the native compilation matrix without smoke. Manual workflow dispatch
always runs the existing desktop compilation matrix and runs this smoke only
when the input is enabled.

**Limits:** Xvfb is a virtual Linux GUI, not installed macOS or Windows
acceptance. The job does not automate the native MCP settings On/Off toggle,
prove toggle acknowledgement ordering, exercise GUI undo/redo or demonstrate
the two-job `board_busy` path through serialized native requests. Keep
these as separate G4.4 acceptance items; do not mark them PASS merely because
the Linux smoke is green. A real installed macOS client must independently
retest the original Plot screenshot defect before claiming it fixed there.
