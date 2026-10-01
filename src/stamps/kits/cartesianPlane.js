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

import { STAMP_VERSION } from '../schema.js'

// Placeholder ink. DrawBoard replaces AUTO ink with the board default on insert.
const INK = '#000000'
const SIZE = 400
const HALF = SIZE / 2

function axisLine(x1, y1, x2, y2, strokeWidth = 2) {
  return {
    type: 'line',
    x1,
    y1,
    x2,
    y2,
    stroke: INK,
    strokeWidth,
    originX: 'center',
    originY: 'center',
    mathboardInkMode: 'auto',
  }
}

function tickLabel(text, left, top) {
  return {
    type: 'text',
    text,
    left,
    top,
    fontSize: 14,
    fontFamily: 'Arial',
    fill: INK,
    originX: 'center',
    originY: 'center',
    mathboardInkMode: 'auto',
  }
}

/**
 * Cartesian plane centered at local (0,0): axes with arrowheads and labels.
 */
export function buildCartesianPlaneDocument() {
  const objects = []

  objects.push(axisLine(-HALF, 0, HALF, 0))
  objects.push(axisLine(0, HALF, 0, -HALF))

  // Arrowheads (simple ticks at positive ends).
  objects.push(axisLine(HALF - 12, -8, HALF, 0))
  objects.push(axisLine(HALF - 12, 8, HALF, 0))
  objects.push(axisLine(-8, -HALF + 12, 0, -HALF))
  objects.push(axisLine(8, -HALF + 12, 0, -HALF))

  objects.push(tickLabel('x', HALF - 16, 18))
  objects.push(tickLabel('y', 16, -HALF + 16))
  objects.push(tickLabel('O', -14, 14))

  return {
    version: STAMP_VERSION,
    objects: [
      {
        type: 'group',
        left: 0,
        top: 0,
        originX: 'center',
        originY: 'center',
        objects,
      },
    ],
  }
}
