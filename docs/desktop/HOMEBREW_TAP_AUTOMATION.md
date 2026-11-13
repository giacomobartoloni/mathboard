# Homebrew tap update PR automation

The public desktop release remains owner-approved and manual. Publication of a
canonical `vMAJOR.MINOR.PATCH` GitHub Release (including an unsigned public
beta prerelease) can propose a cask-only PR to
[`giacomobartoloni/homebrew-tap`](https://github.com/giacomobartoloni/homebrew-tap).
The updater never publishes a release, merges a PR, signs software or installs
packages. It is distinct from the native desktop update-discovery feature.

## Source of truth and trigger

`.github/workflows/update-homebrew-tap.yml` is triggered by `release: published`
and can also run on `workflow_dispatch`. GitHub requires the release-event
workflow to be present on MathBoard's default `main` branch. Merging only
to `develop` does not activate production release handling.

Every run lists GitHub Releases and chooses the highest canonical *published*
version, rather than trusting event order. Drafts, `desktop-v*` candidate tags
and release candidates are not eligible. A later version without both macOS
installers or `SHA256SUMS.txt` fails rather than silently choosing an older
release. If the tap already pins an equal or newer version, the run is a no-op.

The updater downloads and hashes the exact `aarch64` and `x64` DMGs and
compares them with the release manifest (and GitHub asset digests when present).
It modifies only the version and both SHA-256 literals in `Casks/mathboard.rb`.
All other cask content is preserved.

## Owner-managed GitHub App setup

Create a dedicated GitHub App and install it on `homebrew-tap` only.
Grant the installation **Contents: read/write** and **Pull requests: read/write**
(no Workflows permission). Store these credentials in MathBoard repository
Actions settings, **never** in Git, logs, worklogs or issue comments:

- Repository Actions variable `MATHBOARD_TAP_APP_CLIENT_ID`: the App client ID.
- Repository Actions secret `MATHBOARD_TAP_APP_PRIVATE_KEY`: the App private key.

The workflow generates an installation token scoped to `homebrew-tap` and the
two required permissions. The MathBoard `GITHUB_TOKEN` remains read-only.
No personal access token is needed. A missing App configuration fails before
any remote branch or PR write.

## PR ownership, review and recovery

The updater uses the stable branch `automation/update-mathboard` against
`homebrew-tap/main`. It checks for a preexisting branch; if present, there
must be exactly one open PR authored by this GitHub App that changes only
`Casks/mathboard.rb`. An orphaned, altered or human-owned branch fails
closed and requires manual investigation, rather than being overwritten.
Concurrent runs are serialized and older release events do not downgrade.

The tap owns `.github/workflows/validate-cask.yml`, running the cask audit
and checking both published DMGs against their actual pinned hashes. A passing
CI result does **not** certify macOS Gatekeeper behavior, Intel/ARM GUI
acceptance, Apple Developer ID signing or notarization. The maintainer reviews
the official release, hashes, CI and platform-acceptance evidence before
**manually merging** the generated PR. Do not enable auto-merge.

After both reviewed repository PRs reach their default branches and the App is
configured, run a manual backfill from MathBoard `main`, for example:

```sh
gh workflow run update-homebrew-tap.yml --repo giacomobartoloni/mathboard --ref main
```

The published `v1.12.0` can seed an initial PR if the tap still pins `1.11.0`.
Reruns should be idempotent. If a PR was merged and its automation branch
remains, delete that branch manually before generating a later update; do not
force-overwrite an unexpected branch. Review GitHub Actions logs on API,
permissions, asset or checksum failures.

## Verification

```sh
node --test tests/homebrewTapAutomation.test.js
npm run test:unit
```

A real end-to-end test additionally requires the owner-managed App secrets,
an enabled default-branch workflow, the tap CI on `main`, a published release
and inspection of the generated tap PR. It does not replace the desktop release
checklist in [RELEASE.md](RELEASE.md).
