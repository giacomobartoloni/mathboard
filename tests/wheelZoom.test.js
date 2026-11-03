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
import { wheelZoomLevel, MIN_BOARD_ZOOM, MAX_BOARD_ZOOM } from '../src/board/viewport/wheelZoom.js'

test('wheel up zooms in, wheel down zooms out', () => {
  assert.ok(wheelZoomLevel(1, -120) > 1)
  assert.ok(wheelZoomLevel(1, 120) < 1)
  assert.equal(wheelZoomLevel(1, 0), 1)
})

test('wheel zoom respects existing 10%-500% limits', () => {
  assert.equal(wheelZoomLevel(4.95, -1000), MAX_BOARD_ZOOM)
  assert.equal(wheelZoomLevel(0.11, 1000), MIN_BOARD_ZOOM)
})

test('line/page delta modes and invalid deltas are safe', () => {
  assert.ok(wheelZoomLevel(1, -3, 1) > 1)
  assert.ok(wheelZoomLevel(1, 1, 2) < 1)
  assert.equal(wheelZoomLevel(1, NaN), 1)
  assert.equal(wheelZoomLevel(1, Infinity), 1)
})
