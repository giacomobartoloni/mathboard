# Desktop download pages

The site publishes a download hub at `/download/`, dedicated macOS/Windows/Linux
installation guides and a beta security guide. The pages are part of the static SEO
sidecar, not the Vue application shell. The interactive board must remain at `/`.

## Trust and release data

`package.json` is the single source of the application/build version (consumed by
Tauri) and desktop download version. At build time,
`seo/data/desktop-release.mjs` derives the GitHub tag (`v<version>`) from it,
while `seo/lib/desktop-release.mjs` derives the seven release asset filenames.
Only `main` is deployed to users; development previews can point to unpublished
release assets and must not be used for distribution.
Platform-specific manual QA remains recorded separately in `testedPlatforms`.

No installer or checksum is hosted on MathBoard's web origin. Each link points
directly to an official GitHub Release asset.

The build checks that the release is explicitly marked as an unsigned public
prerelease, the version matches the tag, every expected format exists in the
manifest, and filenames agree with the version. These checks do **not** prove
that GitHub currently serves the files or that signing, functional QA, and
publication approval have been completed.

When preparing the next approved public desktop release:

1. Complete the per-platform manual acceptance gates in `docs/desktop/RELEASE.md`
   and verify the new GitHub Release is **published** (not a draft) and
   flagged as a **prerelease** while unsigned.
2. Inspect the actual release's seven assets on GitHub, including
   `SHA256SUMS.txt`. Check the version, asset filenames and checksum entries.
   Do not use `releases/latest` to select an unsigned prerelease.
3. Update the version in `package.json` and follow `docs/desktop/RELEASE.md`
   to keep the native build versions aligned. Do not edit release tags or
   installer filenames in the download manifest: they are derived at build
   time. Update `testedPlatforms` based on *recorded* manual validation of each
   specific installer, never packaging CI alone. Keep the status
   `unsigned-public-beta` until a separately approved signed release strategy
   changes the page schema and copy.
4. Run `npm run test:unit`, `npm run build` and check the
   HTML generated in `dist/download/**/index.html`, download URL targets,
   sitemap, platform guidance, breadcrumbs and metadata.
5. Promote `main` to production only after the corresponding `v<version>`
   GitHub Release is published and its assets and QA claims are reviewed.
   The static site does not call GitHub APIs at page-load time.

The asset links have `data-download-*` attributes. On the production site,
the existing privacy-preserving Simple Analytics transport emits a
`download_clicked` event with page, platform, asset key, version and placement.
This measures *click intent*, not confirmed file transfers or installations.
No individual, board content or persistent identifier is sent.

## Page content boundaries

- Only platforms documented as manually validated for the approved release may
  be listed in `testedPlatforms`; never carry QA claims forward implicitly.
- Windows, Linux and macOS Intel must not be presented as manually validated
  without corresponding release acceptance evidence.
- macOS is not Apple Developer ID-signed or notarized; Windows is not
  Authenticode-signed; Linux has no signed package-repository identity.
- The SHA-256 manifest checks integrity, not verified publisher identity.
- Do not advise disabling security controls or bypassing organization policies.
- The desktop updater is not implemented; browser access remains available.
