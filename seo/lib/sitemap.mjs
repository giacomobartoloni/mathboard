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


import { ORIGIN } from './structured-data.mjs'

/**
 * Render stable sitemap data. An omitted lastmod means the page's significant
 * modification date is not explicitly known; it must never be fabricated.
 */
export function renderSitemap(entries) {
  const paths = new Set()
  const body = entries.map(({ path, lastmod }) => {
    if (!path.startsWith('/') || (path !== '/' && !path.endsWith('/'))) {
      throw new Error(`Invalid sitemap path: ${path}`)
    }
    if (paths.has(path)) throw new Error(`Duplicate URLs in sitemap: ${path}`)
    paths.add(path)
    if (lastmod !== undefined) {
      if (
        typeof lastmod !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)
        || Number.isNaN(Date.parse(`${lastmod}T00:00:00Z`))
        || new Date(`${lastmod}T00:00:00Z`).toISOString().slice(0, 10) !== lastmod
      ) {
        throw new Error(`Invalid sitemap lastmod on ${path}: ${lastmod}`)
      }
    }
    const url = `${ORIGIN}${path}`.replaceAll('&', '&amp;')
    return `  <url>
    <loc>${url}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`
}
