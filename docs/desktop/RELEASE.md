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

## GitHub draft-release pipeline

`.github/workflows/release-desktop.yml` is a separate, tag-triggered release-candidate
pipeline. A pull request only runs the source verification job (no package upload).
No installer is uploaded until a matching tag is pushed; no release is made public
by the workflow.

### Create a candidate (manual owner approval required)

1. Merge the Tauri desktop PR into `develop`, then integrate the approved desktop
   version into `main`. The workflow itself may be merged later and is deliberately
   developed as a separate, stacked PR.
2. Confirm `main` has green CI and the committed `package.json`,
   `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` versions agree.
3. On the reviewed, immutable release commit reachable from `main`, create and
   push a unique tag in the form `desktop-v1.8.0-rc.1` (or `desktop-v1.8.0`).
   The version part must equal the package and Cargo versions. Never reuse a tag.
4. Check the `Desktop Release Candidate` workflow: the source verification job
   first checks the tag syntax, version consistency, main ancestry, lint, tests,
   and production build. Packaging is not allowed if verification fails.
5. On four native runners, Tauri builds macOS Apple Silicon/Intel DMGs, Windows
   x64 NSIS and MSI installers, and Linux x64 .deb and AppImage packages. The
   action attaches them to a **Draft Release**, marked as a prerelease.
6. After all platform builds pass, the checksum job downloads the draft assets,
   verifies the five expected artifact categories (including two macOS DMGs),
   and uploads `SHA256SUMS.txt`.

Example tagging commands (run only after approval and checkout of the verified
release commit on `main`):

```sh
git fetch origin
git switch main
git pull --ff-only origin main
git tag desktop-v1.8.0-rc.1
git push origin desktop-v1.8.0-rc.1
```

The tag push triggers a billable GitHub Actions matrix and creates a **draft**, not
a published GitHub Release. Pushing a tag must never be used to bypass approval,
checks, platform acceptance, or code signing.

### Review and publish

- Download each installer from the draft and run the platform-specific native
  `docs/desktop/TEST_MATRIX.md`, including a clean-install/offline smoke test,
  CSP, external links, and persisted board access.
- Confirm the expected signing/notarization identities and verify package
  signatures on clean target machines. **The initial workflow has no signing
  secrets and produces unsigned/not-notarized release candidates.** The macOS
  build uses ad-hoc signing only; it is **not** Developer ID signing.
- Match each downloaded package against `SHA256SUMS.txt` (for example,
  `shasum -a 256 <filename>` on macOS). Record the exact commit, platform,
  WebView version, and test evidence.
- Before any public distribution, extend the release workflow with Apple
  Developer ID signing/notarization and Windows Authenticode signing; rerun
  a full candidate. Add release notes and validate all uploaded assets.
- Only after explicit owner approval, use GitHub **Releases > Edit > Publish
  release**. Mark the release as a prerelease or stable release as appropriate.
  The workflow itself must **never** automatically publish a draft.

### Signing setup prerequisites

For macOS, enroll in the Apple Developer Program and create a Developer ID
Application certificate. Export its private-key certificate as a password-protected
P12 for CI; keep the base64-encoded P12 and password in GitHub Secrets. Configure
a disposable keychain for the macOS runner and use App Store Connect API credentials
(or an Apple ID app-specific password) for notarization/stapling. Plan the signing
identity's long-term ownership before releasing `app.mathboard.desktop`.

For Windows, decide on a CA-issued OV code-signing certificate with secure private
key custody, Microsoft Artifact Signing if eligible for the account type and
jurisdiction, or Microsoft Store distribution. A signature alone does not guarantee
immediate Microsoft SmartScreen reputation. Tauri supports a custom
`bundle.windows.signCommand` for managed signing providers; select and verify
one before adding secrets. Do not add placeholder credentials or public PFX/P12
files to this repository.

Relevant upstream references:
- https://v2.tauri.app/distribute/pipelines/github/
- https://v2.tauri.app/distribute/sign/macos/
- https://v2.tauri.app/distribute/sign/windows/

## Current release boundary

`.github/workflows/desktop.yml` runs lint, web build, and an unbundled native compile on
Linux, Windows, and macOS. It does not create, sign, notarize, or publish installers and
does not consume signing secrets.

Automatic updates are deferred. Before adding an updater, define signing-key custody,
artifact hosting, channels, rollback behavior, and compatibility policy in a separate
decision.
