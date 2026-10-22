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
import resources from '../seo/pages/resources.mjs'
import mathWhiteboard from '../seo/pages/math-whiteboard.mjs'
import { renderLayout } from '../seo/lib/render-layout.mjs'
import { validateRenderedHtml } from '../seo/lib/validate-pages.mjs'

test('breadcrumb graph matches the visible list, including the homepage and current URL', () => {
  for (const page of [resources, mathWhiteboard]) {
    assert.doesNotThrow(() => validateRenderedHtml(page, renderLayout(page)))
  }
})

test('breadcrumb graph validation rejects a tampered visual trail', () => {
  const html = renderLayout(mathWhiteboard).replace('<li aria-current="page">Math whiteboard</li>', '')
  assert.throws(() => validateRenderedHtml(mathWhiteboard, html), /BreadcrumbList length mismatch/)
})
