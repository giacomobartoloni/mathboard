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

import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import mathWhiteboard from '../seo/pages/math-whiteboard.mjs'
import {
  MATH_WHITEBOARD_ALTERNATES,
  localizedMathWhiteboards,
} from '../seo/pages/localized-math-whiteboards.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { validatePages, validateRenderedHtml } from '../seo/lib/validate-pages.mjs'

test('international math whiteboards expose full translated, indexable HTML', () => {
  const pages = [mathWhiteboard, ...localizedMathWhiteboards]
  assert.equal(pages.length, 11)
  assert.equal(new Set(pages.map((page) => page.path)).size, 11)
  assert.equal(new Set(MATH_WHITEBOARD_ALTERNATES.map((entry) => entry.lang)).size, 11)

  for (const page of pages) {
    const html = renderLayout(page)
    validateRenderedHtml(page, html)
    const lang = page.locale || 'en'
    assert.ok(html.includes('<html lang="' + lang + '"'))
    assert.ok(html.includes('<link rel="canonical" href="https://mathboard.app' + page.path + '">'))
    assert.equal((html.match(/rel="alternate" hreflang="/g) || []).length, 12)
    assert.ok(html.includes('hreflang="x-default" href="https://mathboard.app/math-whiteboard/"'))
    assert.ok(html.includes('href="' + page.path + '" aria-current="page"'))
    assert.ok(html.includes('data-seo-cta="open-board"'))
    assert.ok(!html.includes('name="robots" content="noindex"'))
    if (lang === 'ar' || lang === 'ur') {
      assert.ok(html.includes('dir="rtl"'))
    }
    if (lang !== 'en') {
      assert.ok(html.includes('class="muted"'))
      assert.ok(html.includes('2x + 3 = 11'))
    }
  }
})

test('locale alternate validation detects missing self-links and reciprocity', () => {
  const page = (path, locale, alternates) => ({
    path, locale, alternates,
    title: 'Title ' + path,
    description: 'Description ' + path,
    h1: 'Heading ' + path,
    body: 'Useful example of a math whiteboard.',
  })
  const links = [{ lang: 'en', path: '/english/' }, { lang: 'it', path: '/italian/' }]
  assert.doesNotThrow(() => validatePages([
    page('/english/', 'en', links),
    page('/italian/', 'it', links),
  ]))

  assert.throws(() => validatePages([
    page('/english/', 'en', [{ lang: 'it', path: '/italian/' }]),
    page('/italian/', 'it', links),
  ]), /Missing self-referencing locale alternate/)

  assert.throws(() => validatePages([
    page('/english/', 'en', links),
    page('/italian/', 'it', [{ lang: 'it', path: '/italian/' }]),
  ]), /Non-reciprocal locale alternate/)
})

test('language switcher items do not inherit article list spacing', () => {
  const css = readFileSync(new URL('../public/seo/site.css', import.meta.url), 'utf8')
  // Shared list spacing shifts all flex items after the first language link.
  assert.match(css, /main \.language-links ul li \+ li \{\s*margin-top: 0;/)
})
