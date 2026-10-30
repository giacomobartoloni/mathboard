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
import { svgForPng } from '../tools/generate-favicon-svg.mjs'

const officialPng = new URL('../public/icon-512x512.png', import.meta.url)

test('favicon SVG embeds the exact official icon without external assets', async () => {
  const png = await readFile(officialPng)
  const svg = svgForPng(png)

  assert.match(svg, /viewBox="0 0 512 512"/)
  const embedded = svg.match(/<image width="512" height="512" href="data:image\/png;base64,([A-Za-z0-9+/=]+)"\/>/)
  assert.ok(embedded, 'favicon must include one self-contained PNG image')
  assert.deepEqual(Buffer.from(embedded[1], 'base64'), png)
  assert.equal(svgForPng(png), svg, 'generation must be deterministic')
})

test('favicon generator rejects invalid or incorrectly sized PNGs', async () => {
  const valid = await readFile(officialPng)
  assert.throws(() => svgForPng(Buffer.from('not a PNG')), /not a valid PNG/)
  const wrongSize = Buffer.from(valid)
  wrongSize.writeUInt32BE(192, 16)
  assert.throws(() => svgForPng(wrongSize), /must be 512x512/)
  const noAlpha = Buffer.from(valid)
  noAlpha[25] = 2
  assert.throws(() => svgForPng(noAlpha), /alpha channel/)
})
