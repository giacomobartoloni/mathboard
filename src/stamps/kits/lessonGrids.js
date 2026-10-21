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

import { STAMP_VERSION } from '../schema.js'

// Local grid geometry is in board world units. A 5 mm step corresponds to
// 96 CSS px/in at 100% zoom; physical print scale is not guaranteed.
const HALF = 200
const CARTESIAN_STEP = 40
const PAPER_STEP_5_MM = 96 * 5 / 25.4
const INK = '#000000'

function line(x1, y1, x2, y2, { strong = false } = {}) {
  return {
    type: 'line',
    x1, y1, x2, y2,
    originX: 'center',
    originY: 'center',
    stroke: INK,
    strokeWidth: strong ? 2 : 1,
    opacity: strong ? 1 : 0.42,
    mathboardInkMode: 'auto',
  }
}

function label(text, left, top) {
  return {
    type: 'text',
    text,
    left,
    top,
    fontSize: 16,
    fontFamily: 'Arial',
    fill: INK,
    originX: 'center',
    originY: 'center',
    mathboardInkMode: 'auto',
  }
}

function asStamp(objects) {
  return {
    version: STAMP_VERSION,
    objects: [{
      type: 'group',
      left: 0,
      top: 0,
      originX: 'center',
      originY: 'center',
      objects,
    }],
  }
}

function squareGrid(step, { strongAxes = false, majorEvery = 0 } = {}) {
  const objects = []
  const count = Math.floor(HALF / step)
  for (let i = -count; i <= count; i += 1) {
    const coordinate = i * step
    const strong = (strongAxes && i === 0)
      || (majorEvery > 0 && i % majorEvery === 0)
    objects.push(line(coordinate, -HALF, coordinate, HALF, { strong }))
    objects.push(line(-HALF, coordinate, HALF, coordinate, { strong }))
  }
  return objects
}

/** Ten-by-ten Cartesian grid with centered axes and editable labels. */
export function buildCartesianGridDocument() {
  return asStamp([
    ...squareGrid(CARTESIAN_STEP, { strongAxes: true }),
    label('x', HALF - 12, 17),
    label('y', 16, -HALF + 12),
    label('0', -13, 14),
  ])
}

/** Nominal 5 mm graph paper at 96 CSS pixels/inch, at 100% zoom. */
export function buildSquareGridDocument() {
  return asStamp(squareGrid(PAPER_STEP_5_MM, { majorEvery: 5 }))
}

/** Ruled writing guide: horizontal rows and a vertical margin. */
export function buildRuledPaperDocument() {
  const objects = []
  for (let y = -176; y <= 176; y += 32) {
    objects.push(line(-HALF, y, HALF, y))
  }
  objects.push(line(-155, -HALF, -155, HALF, { strong: true }))
  return asStamp(objects)
}

// Clip an infinite diagonal y = slope*x + intercept to the square world area.
function clippedDiagonal(slope, intercept) {
  const points = []
  const add = (x, y) => {
    if (x < -HALF - 1e-8 || x > HALF + 1e-8
      || y < -HALF - 1e-8 || y > HALF + 1e-8) return
    if (points.some((point) => Math.abs(point.x - x) < 1e-7
      && Math.abs(point.y - y) < 1e-7)) return
    points.push({ x: Math.max(-HALF, Math.min(HALF, x)),
      y: Math.max(-HALF, Math.min(HALF, y)) })
  }
  add(-HALF, -slope * HALF + intercept)
  add(HALF, slope * HALF + intercept)
  add((-HALF - intercept) / slope, -HALF)
  add((HALF - intercept) / slope, HALF)
  if (points.length !== 2) return null
  return line(points[0].x, points[0].y, points[1].x, points[1].y)
}

/** Three families of parallel lines produce an equilateral triangle grid. */
export function buildTriangularGridDocument() {
  const objects = []
  const step = 32
  const rowHeight = Math.sqrt(3) * step / 2
  for (let row = -7; row <= 7; row += 1) {
    const y = row * rowHeight
    objects.push(line(-HALF, y, HALF, y))
  }
  for (const slope of [Math.sqrt(3), -Math.sqrt(3)]) {
    for (let index = -13; index <= 13; index += 1) {
      const diagonal = clippedDiagonal(slope, index * 2 * rowHeight)
      if (diagonal) objects.push(diagonal)
    }
  }
  return asStamp(objects)
}

/** Complex plane uses the same grid, with real and imaginary labels. */
export function buildComplexPlaneDocument() {
  return asStamp([
    ...squareGrid(CARTESIAN_STEP, { strongAxes: true }),
    label('Re', HALF - 19, 18),
    label('Im', 22, -HALF + 14),
    label('0', -13, 14),
    label('1', CARTESIAN_STEP, 16),
    label('i', 15, -CARTESIAN_STEP),
  ])
}
