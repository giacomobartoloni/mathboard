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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import graphLinearFunction from '../seo/pages/graph-linear-function.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { validateRenderedHtml, collectInternalHrefs } from '../seo/lib/validate-pages.mjs'

test('E003 is crawlable, readable, and linked to the board and existing guides', () => {
  const page = graphLinearFunction
  const html = renderLayout(page)
  assert.equal(page.path, '/examples/graph-linear-function/')
  assert.equal(page.needsKatex, true)
  assert.doesNotThrow(() => validateRenderedHtml(page, html))
  assert.match(html, /<link rel="canonical" href="https:\/\/mathboard\.app\/examples\/graph-linear-function\/"/)
  assert.match(html, /<h1>How to graph a linear function by hand<\/h1>/)
  assert.match(html, /<table>[\s\S]*?\(2, 5\)[\s\S]*?<\/table>/)
  assert.match(html, /\(0, 1\)[\s\S]*?\(1, 3\)/)
  assert.match(html, /MathBoard does not automatically plot an equation/)
  assert.match(html, /data-seo-cta="open-board"/)
  assert.ok(collectInternalHrefs(html).includes('/math-whiteboard/'))
  assert.ok(collectInternalHrefs(html).includes('/latex-whiteboard/'))
  assert.ok(html.includes('katex'))
})

test('E003 illustrative SVG has accurate marked points and an accessible explanation', () => {
  const svg = readFileSync(new URL('../public/seo/examples/linear-function.svg', import.meta.url), 'utf8')
  assert.match(svg, /<title id="linear-graph-title">Graph of y equals 2x plus 1<\/title>/)
  assert.match(svg, /<desc id="linear-graph-desc">/)
  for (const label of ['(0, 1)', '(1, 3)', '(2, 5)', 'rise 2', 'run 1']) {
    assert.ok(svg.includes(label), label)
  }
  assert.match(svg, /M 200 480 L 410 60/)
  assert.match(svg, /M 260 360 H 320 V 240/)
})

test('E003 board capture documents the real MathBoard workflow', () => {
  const html = renderLayout(graphLinearFunction)
  assert.match(
    html,
    /<img[\s\S]*?src="\/seo\/examples\/linear-function-board\.png"[\s\S]*?width="1048"[\s\S]*?height="1048"[\s\S]*?alt="[^"]*\(0, 1\)[^"]*"/,
  )
  assert.match(html, /Created in MathBoard with the Cartesian plane stamp/)
  assert.match(html, /MathBoard does not plot the equation automatically/)
  assert.ok(html.includes('href="/seo/examples/linear-function-board.png"'))

  const png = readFileSync(new URL('../public/seo/examples/linear-function-board.png', import.meta.url))
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(png.readUInt32BE(16), 1048)
  assert.equal(png.readUInt32BE(20), 1048)
})
