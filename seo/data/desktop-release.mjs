/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { readFileSync } from 'node:fs'
import { createDesktopRelease } from '../lib/desktop-release.mjs'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

/**
 * Download links follow package.json, like Tauri. Only main is deployed to users;
 * publish and approve its matching GitHub release before promoting main.
 * Manual platform QA remains release-specific.
 */
export const desktopRelease = createDesktopRelease({
  tag: `v${version}`,
  prerelease: true,
  status: 'unsigned-public-beta',
  testedPlatforms: ['macos-arm64'],
})
