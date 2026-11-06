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

import { PlotError } from './PlotExpression.js'

export function validateMathWindow(window) {
  if (!window || !['xMin', 'xMax', 'yMin', 'yMax'].every(k =>
    Number.isFinite(window[k]) && Math.abs(window[k]) <= 1e12) ||
    !(window.xMax > window.xMin) || !(window.yMax > window.yMin)) {
    throw new PlotError('invalid_domain', 'Expected finite ordered mathematical bounds within 1e12')
  }
}

/** Math -> plot-local pixels only. Board/world and viewport transforms are external. */
export function createPlotTransform(window, frame) {
  validateMathWindow(window)
  if (!frame || ![frame.width, frame.height].every(v => Number.isFinite(v) && v > 0 && v <= 16384)) {
    throw new PlotError('invalid_domain', 'Invalid plot frame')
  }
  const {xMin, xMax, yMin, yMax} = window
  const sx = frame.width / (xMax - xMin), sy = frame.height / (yMax - yMin)
  if (![sx, sy].every(v => Number.isFinite(v) && v > 0)) throw new PlotError('invalid_domain', 'Unrepresentable plot scale')
  return Object.freeze({ isotropic: Math.abs(sx - sy) <= 1e-12 * Math.max(sx, sy),
    toFrame: ({x, y}) => ({x: (x - xMin) * sx, y: (yMax - y) * sy}),
    toMath: ({x, y}) => ({x: xMin + x / sx, y: yMax - y / sy}) })
}

/** Liang-Barsky clipping of an already continuity-checked mathematical chord. */
export function clipMathSegment(a, b, window) {
  validateMathWindow(window)
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) throw new PlotError('invalid_domain', 'Nonfinite point')
  const dx = b.x - a.x, dy = b.y - a.y
  if (![dx, dy].every(Number.isFinite)) throw new PlotError('invalid_domain', 'Unrepresentable clipping delta')
  let lo = 0, hi = 1
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - window.xMin, window.xMax - a.x, a.y - window.yMin, window.yMax - a.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue }
    const t = q[i] / p[i]
    if (p[i] < 0) lo = Math.max(lo, t)
    else hi = Math.min(hi, t)
    if (lo > hi) return null
  }
  return [{x: a.x + lo * dx, y: a.y + lo * dy}, {x: a.x + hi * dx, y: a.y + hi * dy}]
}
