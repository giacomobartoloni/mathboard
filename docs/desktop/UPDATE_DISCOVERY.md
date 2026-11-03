# Native desktop update discovery

MathBoard's **Updates** menu is implemented entirely in Tauri's Rust host.
The shared Vue/Vite application and browser build are unchanged. This is
**discovery-only**: no automatic download, installation, restart, updater
plugin, signature keys, WebView commands or frontend event listeners.

## Behavior

- A background check starts when the native application opens (excluding the
  headless companion HTTP mode), then every 24 hours while the process runs.
  **Updates (new version)** appears in the native menu when an eligible
  release is found.
- **Updates > Check for Updates…** checks on demand. While checking, the
  action is disabled. The second menu row displays **Up to date**, a
  retryable **Could not check updates** state, or
  **Version X.Y.Z available — View release…**. Selecting a newer release
  opens the official GitHub release page in the system browser.
- A fixed GitHub Releases API endpoint is queried from Rust with a 10-second
  timeout and redirects disabled. No user/board data or caller-provided URLs
  are sent. Failed checks never block the board or its offline storage.
- Only published `vMAJOR.MINOR.PATCH` releases newer than the installed
  bundled Tauri version are eligible. Drafts, packaging `desktop-v*` RCs,
  missing `SHA256SUMS.txt`, and releases without an installer for the
  running OS and CPU are ignored. Published prereleases remain eligible
  during the explicitly unsigned public beta.
- Release links are constructed only from validated version tags under
  `https://github.com/giacomobartoloni/mathboard/releases/tag/`.
  The user still chooses and installs an unsigned beta manually and should
  consult its release-specific security guidance and platform QA status.

## Verification

- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml desktop_updates`
- Standard frontend lint, tests and build, with no changes to `src/`.
- Native packaged acceptance on macOS (Apple Silicon and Intel), Windows
  x64, Linux x64: startup check, repeat/manual check, online/offline behavior,
  menu status, official release link, no WebView network requests.
- Ensure the updater does not run in the headless companion startup mode.
  Native CI compilation alone does not prove packaged GUI behavior.

## Release workflow follow-up

The packaging workflow uses `desktop-v*` candidate tags while approved
public download pages use `v*`. Discovery follows the published public
channel only; reconciling release naming requires a separate reviewed change.
No GitHub draft is promoted automatically.

## Future updater (out of scope)

Automatic updates require a separate decision about signing keys, artifact
formats, distribution channels, rollback and recovery behavior.
