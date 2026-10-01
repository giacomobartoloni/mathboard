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

const INK = '#2c3e50'
const LIGHT = '#8a96a3'
const RADIUS = 120

function axisLine(x1, y1, x2, y2, stroke = INK, strokeWidth = 2) {
  return {
    type: 'line',
    x1,
    y1,
    x2,
    y2,
    stroke,
    strokeWidth,
    originX: 'center',
    originY: 'center',
  }
}

function label(text, left, top, fontSize = 14) {
  return {
    type: 'text',
    text,
    left,
    top,
    fontSize,
    fontFamily: 'Arial',
    fill: INK,
    originX: 'center',
    originY: 'center',
  }
}

/**
 * Unit circle with axes, angle marks at common radians, and a radius sample.
 */
export function buildUnitCircleDocument() {
  const extent = RADIUS + 40
  const objects = [
    {
      type: 'circle',
      left: 0,
      top: 0,
      radius: RADIUS,
      fill: 'transparent',
      stroke: INK,
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
    },
    axisLine(-extent, 0, extent, 0),
    axisLine(0, extent, 0, -extent),
    // Sample ray at 60° (π/3).
    axisLine(0, 0, RADIUS * 0.5, -RADIUS * Math.sqrt(3) / 2, INK, 2),
    {
      type: 'circle',
      left: RADIUS * 0.5,
      top: -RADIUS * Math.sqrt(3) / 2,
      radius: 4,
      fill: INK,
      stroke: INK,
      strokeWidth: 1,
      originX: 'center',
      originY: 'center',
    },
    // Quadrant tick marks.
    axisLine(RADIUS - 6, 0, RADIUS + 6, 0, LIGHT, 1),
    axisLine(-RADIUS - 6, 0, -RADIUS + 6, 0, LIGHT, 1),
    axisLine(0, -RADIUS - 6, 0, -RADIUS + 6, LIGHT, 1),
    axisLine(0, RADIUS - 6, 0, RADIUS + 6, LIGHT, 1),
    label('1', RADIUS + 16, 0),
    label('-1', -RADIUS - 18, 0),
    label('1', 0, -RADIUS - 16),
    label('-1', 0, RADIUS + 16),
    label('0', -12, 12),
    {
      type: 'formula',
      latex: '\\frac{\\pi}{3}',
      left: RADIUS * 0.35,
      top: -RADIUS * 0.45,
      originX: 'center',
      originY: 'center',
      mathboardInkMode: 'auto',
    },
  ]

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
