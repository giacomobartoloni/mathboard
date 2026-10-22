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

const PUBLIC_SITE_ORIGIN = 'https://mathboard.app'
const PUBLIC_SITE_PAGES = new Set(['/resources/', '/download/', '/privacy-policy.html'])

/** Resolve explicitly supported site pages for opening outside the desktop WebView. */
export function publicSitePageUrl(path) {
  if (!PUBLIC_SITE_PAGES.has(path)) {
    throw new TypeError(`Unsupported public site page: ${path}`)
  }
  return `${PUBLIC_SITE_ORIGIN}${path}`
}
