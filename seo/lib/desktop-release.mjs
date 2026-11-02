/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

/**
 * Pure asset naming rules, independent of package.json and GitHub APIs.
 */
export const DESKTOP_ASSET_FORMATS = Object.freeze({
  macosArm64: { platform: 'macos', suffix: '_aarch64.dmg' },
  macosIntel: { platform: 'macos', suffix: '_x64.dmg' },
  windowsExe: { platform: 'windows', suffix: '_x64-setup.exe' },
  windowsMsi: { platform: 'windows', suffix: '_x64_en-US.msi' },
  linuxAppImage: { platform: 'linux', suffix: '_amd64.AppImage' },
  linuxDeb: { platform: 'linux', suffix: '_amd64.deb' },
  checksums: { platform: 'all', suffix: 'SHA256SUMS.txt' },
})

/**
 * Materialize release asset names from the versioned tag passed by the caller.
 */
export function createDesktopRelease({ tag, prerelease, status, testedPlatforms }) {
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error('Desktop release tag must use vMAJOR.MINOR.PATCH')
  }
  if (!Array.isArray(testedPlatforms)) {
    throw new Error('Desktop release testedPlatforms must be an array')
  }

  const version = tag.slice(1)
  const assets = Object.fromEntries(
    Object.entries(DESKTOP_ASSET_FORMATS).map(([key, { suffix }]) => [
      key,
      key === 'checksums' ? suffix : `MathBoard_${version}${suffix}`,
    ]),
  )

  return Object.freeze({
    version,
    tag,
    prerelease,
    status,
    testedPlatforms: Object.freeze([...testedPlatforms]),
    assets: Object.freeze(assets),
  })
}
