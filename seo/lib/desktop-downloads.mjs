/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { desktopRelease } from '../data/desktop-release.mjs'
import { DESKTOP_ASSET_FORMATS } from './desktop-release.mjs'
import { escapeHtml } from './escape-html.mjs'

const REPO_RELEASES = 'https://github.com/giacomobartoloni/mathboard/releases'
/** Fail closed on missing, unreviewed, mismatched or non-official assets. */
export function validateDesktopRelease(release = desktopRelease) {
  if (!/^\d+\.\d+\.\d+$/.test(release.version) ||
      release.tag !== `v${release.version}` ||
      release.status !== 'unsigned-public-beta' ||
      release.prerelease !== true) {
    throw new Error('Desktop download release must be an approved unsigned public beta with a matching tag')
  }
  if (!Array.isArray(release.testedPlatforms) ||
      release.testedPlatforms.some((key) => !['macos-arm64', 'macos-intel', 'windows-x64', 'linux-x64'].includes(key)) ||
      new Set(release.testedPlatforms).size !== release.testedPlatforms.length) {
    throw new Error('Invalid desktop release platform verification list')
  }
  const names = Object.keys(DESKTOP_ASSET_FORMATS)
  if (!release.assets || Object.keys(release.assets).length !== names.length) {
    throw new Error('Desktop release asset set is incomplete')
  }
  for (const key of names) {
    const file = release.assets[key]
    const { suffix } = DESKTOP_ASSET_FORMATS[key]
    const expected = key === 'checksums' ? suffix : `MathBoard_${release.version}${suffix}`
    if (file !== expected) {
      throw new Error(`Invalid desktop release asset: ${key}`)
    }
  }
  if (new Set(Object.values(release.assets)).size !== names.length) {
    throw new Error('Duplicate desktop release filenames')
  }
}

export function releaseUrl(release = desktopRelease) {
  validateDesktopRelease(release)
  return `${REPO_RELEASES}/tag/${release.tag}`
}

export function assetName(key, release = desktopRelease) {
  validateDesktopRelease(release)
  if (!Object.hasOwn(DESKTOP_ASSET_FORMATS, key)) {
    throw new Error(`Unknown desktop release asset: ${key}`)
  }
  return release.assets[key]
}

export function assetUrl(key, release = desktopRelease) {
  return `${REPO_RELEASES}/download/${release.tag}/${encodeURIComponent(assetName(key, release))}`
}

export function renderDownloadLink(key, label, placement, { primary = true } = {}) {
  const platform = DESKTOP_ASSET_FORMATS[key]?.platform
  if (!platform || platform === 'all') throw new Error(`Not an installer: ${key}`)
  return `<a class="button ${primary ? 'button-primary' : ''}"
    href="${escapeHtml(assetUrl(key))}"
    data-download-asset="${escapeHtml(key)}"
    data-download-platform="${escapeHtml(platform)}"
    data-download-version="${escapeHtml(desktopRelease.version)}"
    data-download-placement="${escapeHtml(placement)}"
  >${escapeHtml(label)}</a>`
}

export function renderReleaseContext() {
  return `<p class="download-version">Version ${escapeHtml(desktopRelease.version)} · Free and open source · Unsigned public beta
    · <a href="${escapeHtml(releaseUrl())}">View the official GitHub release</a></p>`
}

export function renderSecurityNotice() {
  return `<aside class="download-notice" aria-label="Desktop beta security information">
    <strong>Before downloading:</strong> These installers are unsigned. macOS is not Apple-notarized;
    Windows and managed devices may warn or block installation.
    Do not disable system-wide security protections.
    <a href="/download/security/">Read the security and verification guide</a>, or
    <a href="/">use MathBoard in your browser</a> without installing.
  </aside>`
}

export function renderChecksumsLink() {
  return `<a href="${escapeHtml(assetUrl('checksums'))}">SHA256SUMS.txt</a>`
}

export function renderVerifiedNote(platformKey) {
  const tested = desktopRelease.testedPlatforms.includes(platformKey)
  return tested
    ? '<span class="download-status">Manually tested on this platform</span>'
    : '<span class="download-status download-status-untested">Installer published; not yet manually validated</span>'
}

