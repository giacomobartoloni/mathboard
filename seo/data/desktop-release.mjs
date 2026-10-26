/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

/**
 * Reviewed, published desktop release snapshot. GitHub hosts every binary.
 * Update this file only after a new public release has been owner-approved.
 * Do not infer platform verification from a successful packaging workflow.
 */
export const desktopRelease = Object.freeze({
  version: '1.10.0',
  tag: 'v1.10.0',
  prerelease: true,
  status: 'unsigned-public-beta',
  testedPlatforms: ['macos-arm64'],
  assets: {
    macosArm64: 'MathBoard_1.10.0_aarch64.dmg',
    macosIntel: 'MathBoard_1.10.0_x64.dmg',
    windowsExe: 'MathBoard_1.10.0_x64-setup.exe',
    windowsMsi: 'MathBoard_1.10.0_x64_en-US.msi',
    linuxAppImage: 'MathBoard_1.10.0_amd64.AppImage',
    linuxDeb: 'MathBoard_1.10.0_amd64.deb',
    checksums: 'SHA256SUMS.txt',
  },
})

