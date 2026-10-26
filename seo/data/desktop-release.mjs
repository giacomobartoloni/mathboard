/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { createDesktopRelease } from '../lib/desktop-release.mjs'

/**
 * Reviewed, published desktop release; intentionally independent from the
 * application version in package.json. Update the tag only after owner approval
 * and confirmation that all seven GitHub release assets are published.
 */
export const desktopRelease = createDesktopRelease({
  tag: 'v1.9.0',
  prerelease: true,
  status: 'unsigned-public-beta',
  testedPlatforms: ['macos-arm64'],
})
