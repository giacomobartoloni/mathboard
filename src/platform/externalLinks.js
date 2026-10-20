/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { openUrl } from '@tauri-apps/plugin-opener'
import { isDesktopRuntime } from './runtime'

const ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:'])

export async function openExternalUrl(url) {
  const parsedUrl = new URL(url)

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new TypeError(`Unsupported external URL protocol: ${parsedUrl.protocol}`)
  }

  if (isDesktopRuntime()) {
    await openUrl(parsedUrl.href)
    return
  }

  window.open(parsedUrl.href, '_blank', 'noopener,noreferrer')
}
