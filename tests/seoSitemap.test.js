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


import test from 'node:test'
import assert from 'node:assert/strict'
import { renderSitemap } from '../seo/lib/sitemap.mjs'

test('sitemap is deterministic and lastmod is opt-in', () => {
  const pages = [{ path: '/' }, { path: '/resources/', lastmod: '2026-10-21' }]
  const result = renderSitemap(pages)
  assert.equal(result, renderSitemap(pages))
  assert.equal((result.match(/<lastmod>/g) || []).length, 1)
  assert.match(result, /<loc>https:\/\/mathboard.app\/resources\/<\/loc>\s*<lastmod>2026-10-21<\/lastmod>/)
})

test('sitemap rejects duplicate paths and invalid lastmod', () => {
  assert.throws(() => renderSitemap([{ path: '/' }, { path: '/' }]), /Duplicate/)
  assert.throws(() => renderSitemap([{ path: '/bad/', lastmod: '2026-02-30' }]), /Invalid/)
  assert.throws(() => renderSitemap([{ path: '/bad/', lastmod: 'today' }]), /Invalid/)
})
