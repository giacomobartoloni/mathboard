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

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const officialIcon = new URL('public/icon-512x512.png', root)
const favicon = new URL('public/favicon.png', root)
const index = new URL('index.html', root)

test('web favicon is byte-for-byte identical to the official 512px icon', async () => {
  const [iconPng, faviconPng] = await Promise.all([
    readFile(officialIcon),
    readFile(favicon),
  ])

  assert.deepEqual(faviconPng, iconPng)
  assert.equal(iconPng.toString('hex', 0, 8), '89504e470d0a1a0a')
  assert.equal(iconPng.readUInt32BE(16), 512)
  assert.equal(iconPng.readUInt32BE(20), 512)
})

test('web page references the correct PNG favicon, not the obsolete SVG or ICO', async () => {
  const html = await readFile(index, 'utf8')

  assert.match(html, /<link rel="icon" type="image\/png" href="\/favicon\.png">/)
  assert.doesNotMatch(html, /favicon\.(?:svg|ico)/)
  assert.match(html, /<link rel="apple-touch-icon" href="\/icon-192x192\.png">/)
})
