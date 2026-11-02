# Desktop update discovery (notification only)

MathBoard desktop checks the official GitHub Releases catalog for newer *published*
`vMAJOR.MINOR.PATCH` builds. This is **not** an automatic updater: it does not
download, install, replace, or restart binaries. It adds no signing keys or Tauri
updater plugin. The existing unsigned-beta warnings and manually reviewed release
workflow remain unchanged.

## Runtime contract

- Only the main Tauri WebView can invoke `check_desktop_update`. The browser build
  never performs the check. A fixed HTTPS GitHub API URL is requested from Rust
  with a 10-second deadline, no redirects, and no user-supplied URLs.
- Release eligibility requires `draft: false`, `published_at`, a strict
  `vMAJOR.MINOR.PATCH` tag, an official installer for the running OS/architecture,
  and `SHA256SUMS.txt`. Published prereleases are intentionally included while
  MathBoard is in the unsigned public beta channel. Release ordering is based
  on numeric versions rather than GitHub's API ordering.
- Compare against Tauri's bundled application version (from `package.json` via
  `tauri.conf.json`), **not** `src-tauri/Cargo.toml` or the website's version.
  The native response contains only the installed version, newer version (if any),
  and a canonical official GitHub release page URL.
- A silent background check runs when the desktop UI mounts and once every 24 hours
  while open. A manual check appears in About. Errors during background checks
  remain quiet; manual failures remain retryable. A dismissible update indicator
  does not interrupt the canvas.
- Detection does not claim that a specific installer has passed manual platform
  acceptance. Users follow the official release and its security instructions.
  GitHub network errors do not affect offline board editing.

## Manual verification

1. Install an older published desktop build and launch while online; verify an
   eligible newer published release is signaled and opens its official release page.
2. Launch while offline; confirm the board remains usable and manual check shows
   a retryable error.
3. Verify the browser build has no update notices or GitHub API requests.
4. Publish no release during tests; verify draft and version-ineligible releases
   are ignored. Repeat on macOS arm64/x64, Windows x64, and Linux x64.
5. Review the unsigned-beta security language before distribution.

## Release workflow follow-up

Packaging currently uses `desktop-v*` tags, while approved public downloads
use `v*` tags. The discovery checker intentionally recognizes only the public
`vMAJOR.MINOR.PATCH` channel. Reconcile these naming conventions in a separate,
explicitly reviewed release-workflow change; do not auto-publish draft releases.

## Future updater (out of scope)

Automatic package download and installation require an additional architectural
decision for Tauri updater signing-key custody, supported bundle formats,
channel/promotion policy, rollback and recovery, and signing/notarization.
