# Desktop release

This document covers a manual-review GitHub release pipeline. The initial release
format may be a clearly labeled **unsigned public beta**, after all target-platform
acceptance tests pass. Developer ID / Authenticode signing and Apple notarization
are future improvements, not prerequisites for an explicitly unsigned beta.
The regular desktop CI workflow only verifies native compilation.

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

## Signing, trust, and unsigned beta policy

**An unsigned public beta is permitted** as an explicitly labeled GitHub
prerelease, provided the complete native acceptance matrix, checksum generation,
platform install checks, security disclosures and manual owner approval all pass.
Do **not** present this as a signed or notarized production/stable release.

- **macOS:** initial DMGs use ad-hoc signing, **not** Apple Developer ID; they are
  not notarized. Gatekeeper may block launch. Only users who trust the source
  and have verified the downloaded asset should consider macOS's per-app
  **System Settings > Privacy & Security > Open Anyway** exception.
  Never recommend disabling Gatekeeper globally or stripping quarantine metadata.
- **Windows:** initial NSIS/ MSI installers are unsigned. Defender SmartScreen,
  Smart App Control, or organization policy may warn or block execution.
  Do not recommend disabling antivirus, SmartScreen or security policy.
- **Linux:** initial AppImage/DEB bundles are not signed with a package-repository
  identity. Provide hashes and test the actual downloaded packages.

**SHA-256 hashes are an integrity check, not an independent authenticity guarantee**
when the binaries and the manifest come from the same unsigned GitHub Release.
Direct users only to the project's official GitHub repository and prefer
documenting the exact Git commit and release workflow run.

For a future **signed release**, use an Apple Developer ID Application
certificate, notarize and staple the macOS app, and configure a Windows
code-signing certificate or a suitable managed signing service. These steps
remain recommended for reducing installation friction and improving publisher
verification. See [Unsigned desktop beta](UNSIGNED_BETA.md) for user guidance.

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
a published GitHub Release. Pushing a tag must never bypass owner approval,
automated checks or platform acceptance. Signing is optional **only for an
explicitly labeled unsigned public beta**.

### Review and publish

- Download each installer from the draft and run the platform-specific native
  `docs/desktop/TEST_MATRIX.md`, including a clean-install/offline smoke test,
  CSP, external links, and persisted board access.
- Distinguish two deliberate publication paths:
  - **Unsigned public beta:** verify on clean machines that the downloaded
    unsigned installers behave as documented; disclose the lack of Developer ID,
    notarization and Authenticode in the release title/body and linked
    [installation guide](UNSIGNED_BETA.md). Publish **as a prerelease** only.
  - **Future signed release:** first integrate and verify Apple Developer ID
    signing/notarization and Windows Authenticode signing, then rerun acceptance.
- Match each downloaded package against `SHA256SUMS.txt` (for example,
  `shasum -a 256 <filename>` on macOS). Record the exact commit, platform,
  WebView version and test evidence. A checksum alone does not establish
  the identity of the publisher.
- Review the staged GitHub Release notes, asset filenames, donation link and
  prominent unsigned warnings. Include the known native limitations and
  record which platforms were actually tested. A failed or untested platform
  cannot be presented as verified.
- Only after explicit owner approval, use GitHub **Releases > Edit > Publish
  release**. The initial unsigned public beta stays marked as a **prerelease**.
  The workflow itself must **never** automatically publish a draft.

### Community funding

MathBoard remains free and open source. Donations to
[Buy Me a Coffee](https://www.buymeacoffee.com/gbartoloni) are voluntary and
help cover Apple Developer membership/notarization and Windows code-signing
expenses for future releases. No donation is needed to download or use MathBoard.
GitHub's `.github/FUNDING.yml` advertises the same optional funding link.
Do not represent a donation as an installer security guarantee.

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
