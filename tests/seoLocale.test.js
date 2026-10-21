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
import english from '../seo/pages/math-whiteboard.mjs'
import italian from '../seo/pages/italian-math-whiteboard.mjs'
import resources from '../seo/pages/resources.mjs'
import latexWhiteboard from '../seo/pages/latex-whiteboard.mjs'
import openSource from '../seo/pages/open-source-math-whiteboard.mjs'
import latexDocs from '../seo/pages/latex-docs.mjs'
import shortcuts from '../seo/pages/keyboard-shortcuts.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { validatePages, validateRenderedHtml } from '../seo/lib/validate-pages.mjs'

test('localized pages render language, canonical and reciprocal hreflang', () => {
  const pages = [english, italian, resources, latexWhiteboard, openSource, latexDocs, shortcuts]
  assert.doesNotThrow(() => validatePages(pages))
  for (const page of pages) {
    const html = renderLayout(page)
    assert.doesNotThrow(() => validateRenderedHtml(page, html))
    assert.match(html, new RegExp('<html lang="' + page.lang + '">'))
    assert.match(html, new RegExp('rel="canonical" href="https://mathboard.app' + page.path + '"'))
    assert.equal((html.match(/rel="alternate"/g) || []).length, 3)
  }
  assert.match(renderLayout(italian), /Apri la lavagna/)
})

test('localized pages reject nonreciprocal or missing variants', () => {
  assert.throws(() => validatePages([english]), /counterpart/)
  const wrongItalian = { ...italian, alternates: { ...italian.alternates, en: '/other/' } }
  assert.throws(() => validatePages([english, wrongItalian]), /Nonreciprocal/)
})
