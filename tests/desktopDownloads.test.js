/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { desktopRelease } from '../seo/data/desktop-release.mjs'
import { createDesktopRelease } from '../seo/lib/desktop-release.mjs'
import {
  assetName, assetUrl, releaseUrl, validateDesktopRelease,
} from '../seo/lib/desktop-downloads.mjs'
import download from '../seo/pages/download.mjs'
import macos from '../seo/pages/download-macos.mjs'
import windows from '../seo/pages/download-windows.mjs'
import linux from '../seo/pages/download-linux.mjs'
import security from '../seo/pages/download-security.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { renderHeader, renderFooter } from '../seo/lib/render-components.mjs'
import { validatePages, validateRenderedHtml } from '../seo/lib/validate-pages.mjs'

const pages = [download, macos, windows, linux, security]
const { version: packageVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

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
  assert.equal(desktopRelease.version, packageVersion)
  assert.equal(desktopRelease.tag, `v${packageVersion}`)
  assert.equal(releaseUrl(), `https://github.com/giacomobartoloni/mathboard/releases/tag/${desktopRelease.tag}`)
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

test('release asset naming derives all filenames from the supplied tag', () => {
  const approved = createDesktopRelease({
    tag: 'v2.3.4',
    prerelease: true,
    status: 'unsigned-public-beta',
    testedPlatforms: ['macos-arm64'],
  })

  assert.equal(approved.version, '2.3.4')
  assert.deepEqual(approved.assets, {
    macosArm64: 'MathBoard_2.3.4_aarch64.dmg',
    macosIntel: 'MathBoard_2.3.4_x64.dmg',
    windowsExe: 'MathBoard_2.3.4_x64-setup.exe',
    windowsMsi: 'MathBoard_2.3.4_x64_en-US.msi',
    linuxAppImage: 'MathBoard_2.3.4_amd64.AppImage',
    linuxDeb: 'MathBoard_2.3.4_amd64.deb',
    checksums: 'SHA256SUMS.txt',
  })
  assert.doesNotThrow(() => validateDesktopRelease(approved))
  assert.throws(() => createDesktopRelease({
    tag: 'desktop-v2.3.4',
    prerelease: true,
    status: 'unsigned-public-beta',
    testedPlatforms: [],
  }), /tag must use/)
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
  const hub = renderLayout(download)
  const macCard = hub.match(/<section class="download-card" aria-labelledby="macos-download">([\s\S]*?)<\/section>/)?.[1]
  assert.ok(macCard, 'macOS download card must render')
  assert.match(macCard, /Apple Silicon DMG:.*?Manually tested on this platform/s)
  assert.match(macCard, /Intel DMG:.*?not yet manually validated/s)
  assert.ok(hub.indexOf('Unsigned public beta:</strong>') < hub.indexOf('data-download-asset="macosArm64"'),
    'unsigned beta warning should appear before installers')
  assert.match(download.body, /Manually tested on this platform/)
  assert.match(download.body, /not yet manually validated/)
  assert.match(macos.body, /Apple Silicon/)
  assert.match(windows.body, /Smart App Control/)
  assert.match(linux.body, /package repository identity/)
  assert.ok(windows.body.includes('Get-FileHash .\\MathBoard_'))
  assert.match(linux.body, /chmod \+x MathBoard_/)
  assert.match(security.body, /does not independently authenticate/)
})

test('privacy page navigation stays in sync with static SEO navigation', () => {
  const privacy = readFileSync(new URL('../public/privacy-policy.html', import.meta.url), 'utf8')
  const navLinks = (html, label) => {
    const nav = html.match(new RegExp('<nav aria-label="' + label + '">([\\s\\S]*?)<\\/nav>'))?.[1]
    assert.ok(nav, label + ' navigation must exist')
    return [...nav.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
  }
  for (const [label, renderer] of [['Primary', renderHeader], ['Footer', renderFooter]]) {
    assert.deepEqual(navLinks(privacy, label), navLinks(renderer(), label))
  }
})


test('editorial download hero keeps a single h1, anchor navigation and browser alternative', () => {
  const hub = renderLayout(download)
  assert.ok(hub.includes('class="download-page download-page--editorial"'))
  assert.equal(hub.split('<h1>').length - 1, 1)
  assert.ok(hub.includes('<h1>MathBoard for desktop</h1>'))
  assert.ok(hub.includes('href="#download-options"'))
  assert.ok(hub.includes('id="download-options"'))
  assert.ok(hub.includes('data-placement="download-hero-browser-alternative"'))
  assert.ok(hub.includes('Illustration of the MathBoard logo'))
  assert.ok(hub.indexOf('Unsigned public beta:</strong>') < hub.indexOf('data-download-asset="macosArm64"'))
  const css = readFileSync(new URL('../public/seo/site.css', import.meta.url), 'utf8')
  assert.ok(css.includes('.download-page--editorial .download-hero'))
  assert.ok(css.includes('background-color: #292a28'))
  assert.ok(css.includes('font-family: Georgia, "Times New Roman", serif'))
  assert.ok(hub.includes('class="download-section-eyebrow"'))
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'))
})
