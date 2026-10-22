# Desktop download pages

The site publishes a download hub at `/download/`, dedicated macOS/Windows/Linux
installation guides and a beta security guide. The pages are part of the static SEO
sidecar, not the Vue application shell. The interactive board must remain at `/`.

## Trust and release data

The single reviewed source of distribution metadata is
`seo/data/desktop-release.mjs`. No installer or checksum is hosted on MathBoard's
web origin. Each link points directly to an official GitHub Release asset.

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
3. Update the version, tag and reviewed asset names in
   `seo/data/desktop-release.mjs`. Set `testedPlatforms` based on *recorded*
   manual validation of each specific installer, never packaging CI alone.
   Keep the status `unsigned-public-beta` until a separately approved signed
   release strategy changes the page schema and copy.
4. Run `npm run test:unit`, `npm run build` and check the
   HTML generated in `dist/download/**/index.html`, download URL targets,
   sitemap, platform guidance, breadcrumbs and metadata.
5. Promote the web changes to the production site only after the manifest and
   GitHub assets have been reviewed together. The static site never resolves
   an unapproved tag or fetches GitHub data at page-load time.

The asset links have `data-download-*` attributes. On the production site,
the existing privacy-preserving Simple Analytics transport emits a
`download_clicked` event with page, platform, asset key, version and placement.
This measures *click intent*, not confirmed file transfers or installations.
No individual, board content or persistent identifier is sent.

## Page content boundaries

- Mac Apple Silicon is the only platform described as manually validated
  for the initial v1.8.0 release, per its published release notes.
- Windows, Linux and macOS Intel must not be presented as manually validated
  without corresponding release acceptance evidence.
- macOS is not Apple Developer ID-signed or notarized; Windows is not
  Authenticode-signed; Linux has no signed package-repository identity.
- The SHA-256 manifest checks integrity, not verified publisher identity.
- Do not advise disabling security controls or bypassing organization policies.
- The desktop updater is not implemented; browser access remains available.
