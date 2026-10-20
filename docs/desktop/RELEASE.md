# Desktop release

This document describes release considerations, not an automated signed-release
pipeline. The desktop CI workflow only verifies that the application compiles.

## Version and identity

`src-tauri/tauri.conf.json` reads the application version from `package.json`. Update
the `package.json` version before creating release artifacts and commit the resulting
lockfile change. Keep the `src-tauri/Cargo.toml` package version and
corresponding `src-tauri/Cargo.lock` entry aligned before each release.

The application identifier is `app.mathboard.desktop`. Treat it as permanent after
distribution: changing it gives the application a different operating-system identity
and disrupts signing, installation, settings, and any future updater channel.

## Build artifacts

Install dependencies and verify the source before bundling on each target operating
system:

```sh
npm ci
npm run lint
npm run build
npm run desktop:build
```

With `"targets": "all"`, Tauri creates every supported bundle format for the current
host under `src-tauri/target/release/bundle/`. Expected formats include:

- macOS: `.app` and `.dmg`
- Windows: NSIS installer and `.msi`
- Linux: AppImage, Debian package, and RPM where host tooling supports them

Artifacts are platform-native; build and validate them on their target OS.
The existing BoardDocument save/open and autosave functionality uses IndexedDB;
Tauri adds no separate native persistence backend. Undo/redo remains session-only.
Validate saved-board access after app restart on each OS; do not assume a scratch
board automatically reopens when sessionStorage is cleared.

## Pre-release GUI gate

Before distributing any installer, run the complete native column in
`docs/desktop/TEST_MATRIX.md` on each target OS against the bundled release candidate.
This is a required release gate, not an optional deferred task. It includes the
production CSP and formula pipeline, scoped HTTPS and `mailto:` opener behavior,
Privacy Policy, fullscreen, and an offline cold start.

The desktop CI command uses `--no-bundle`; it proves that the native host compiles but
does not run the bundled WebView or cover CSP, opener permissions, fullscreen, or
offline GUI behavior. Do not ship installers based only on a passing CI run.

## Signing and trust

- **macOS:** use an Apple Developer ID Application certificate and notarize the
  distributed app. Staple the notarization result before publication.
- **Windows:** use an appropriate code-signing certificate. Unsigned or newly signed
  binaries may trigger Microsoft Defender SmartScreen reputation warnings.
- **Linux:** publish cryptographic hashes and retain build provenance. Package-repository
  signing is separate from Tauri bundling.

Store certificates, passwords, API keys, and notarization credentials only in GitHub
Secrets (or an equivalent release secret store). Never commit them to the repository,
workflow files, or generated configuration.

Windows normally uses the system WebView2 runtime, which keeps installers smaller and
allows Microsoft to service the runtime. Systems without it may need the bootstrapper
or an online download. A fixed WebView2 runtime supports offline and version-pinned
installations but substantially increases artifact size and transfers runtime patching
responsibility to the release process.

## Current release boundary

`.github/workflows/desktop.yml` runs lint, web build, and an unbundled native compile on
Linux, Windows, and macOS. It does not create, sign, notarize, or publish installers and
does not consume signing secrets.

Automatic updates are deferred. Before adding an updater, define signing-key custody,
artifact hosting, channels, rollback behavior, and compatibility policy in a separate
decision.
