/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { desktopRelease } from '../seo/data/desktop-release.mjs'
import {
  assetName, assetUrl, releaseUrl, validateDesktopRelease,
} from '../seo/lib/desktop-downloads.mjs'
import download from '../seo/pages/download.mjs'
import macos from '../seo/pages/download-macos.mjs'
import windows from '../seo/pages/download-windows.mjs'
import linux from '../seo/pages/download-linux.mjs'
import security from '../seo/pages/download-security.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { validatePages, validateRenderedHtml } from '../seo/lib/validate-pages.mjs'

const pages = [download, macos, windows, linux, security]

test('download pages have unique paths and valid rendered HTML, structured data and breadcrumbs', () => {
  const { paths } = validatePages(pages)
  for (const page of pages) {
    assert.ok(paths.has(page.path))
    assert.match(page.lastmod, /^\d{4}-\d{2}-\d{2}$/)
    const html = renderLayout(page)
    assert.doesNotThrow(() => validateRenderedHtml(page, html))
    assert.match(html, /href="\/download\/security\/"/)
    assert.match(html, /Unsigned public beta/i)
  }
})

test('all download links resolve directly to official versioned GitHub assets', () => {
  assert.doesNotThrow(() => validateDesktopRelease())
  assert.equal(releaseUrl(), 'https://github.com/giacomobartoloni/mathboard/releases/tag/v1.8.0')
  for (const [key, name] of Object.entries(desktopRelease.assets)) {
    assert.equal(assetName(key), name)
    assert.equal(assetUrl(key),
      `https://github.com/giacomobartoloni/mathboard/releases/download/${desktopRelease.tag}/${name}`)
  }
  assert.doesNotMatch(pages.map((p) => p.body).join(' '), /releases\/latest/)
  const hub = renderLayout(download)
  for (const key of Object.keys(desktopRelease.assets).filter((x) => x !== 'checksums')) {
    assert.match(hub, new RegExp(`data-download-asset="${key}"`))
  }
})

test('manifest validation rejects incorrect tags, missing assets or unapproved releases', () => {
  const copy = (overrides = {}) => ({
    ...desktopRelease,
    assets: { ...desktopRelease.assets },
    testedPlatforms: [...desktopRelease.testedPlatforms],
    ...overrides,
  })
  assert.throws(() => validateDesktopRelease(copy({ tag: 'v0.0.0' })), /matching tag/)
  assert.throws(() => validateDesktopRelease(copy({ prerelease: false })), /public beta/)
  assert.throws(() => validateDesktopRelease(copy({ status: 'stable' })), /public beta/)
  const wrongAssets = copy()
  wrongAssets.assets.windowsExe = 'something-else.exe'
  assert.throws(() => validateDesktopRelease(wrongAssets), /windowsExe/)
  const missingAssets = copy()
  delete missingAssets.assets.linuxDeb
  assert.throws(() => validateDesktopRelease(missingAssets), /incomplete/)
  assert.throws(() => assetUrl('not-a-platform'), /Unknown/)
})

test('the beta clearly distinguishes validated and untested platforms', () => {
  assert.match(download.body, /Manually tested on this platform/)
  assert.match(download.body, /not yet manually validated/)
  assert.match(macos.body, /Apple Silicon/)
  assert.match(windows.body, /Smart App Control/)
  assert.match(linux.body, /package repository identity/)
  assert.ok(windows.body.includes('Get-FileHash .\\MathBoard_'))
  assert.match(linux.body, /chmod \+x MathBoard_/)
  assert.match(security.body, /does not independently authenticate/)
})
