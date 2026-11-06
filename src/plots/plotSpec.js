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

import { PlotError } from './PlotError.js'
import { createPlotTransform } from './PlotGeometry.js'
export const PLOT_KEYS = ['syntax', 'latex', 'mathWindow', 'frame', 'axes', 'grid', 'border', 'color']
export const DEFAULT_PLOT = Object.freeze({
  type: 'plot',
  syntax: 'latex-v1',
  latex: 'x^2-5x+6',
  mathWindow: { xMin: -6, xMax: 6, yMin: -4, yMax: 4 },
  frame: { width: 480, height: 320 },
  axes: true,
  grid: true,
  border: true
})
export const PLOT_COLORS = ['auto', '#2563eb', '#dc2626', '#16a34a', '#9333ea']
export function validatePlotSpec(spec) {
  if (spec?.border !== undefined && typeof spec.border !== 'boolean')
    throw new PlotError('invalid_plot', 'Graph border must be enabled or disabled.')
  if (spec?.color !== undefined && !PLOT_COLORS.includes(spec.color))
    throw new PlotError('invalid_plot', 'Unsupported graph color.')
  if (
    !spec ||
    spec.syntax !== 'latex-v1' ||
    typeof spec.latex !== 'string' ||
    !spec.latex.trim() ||
    spec.latex.length > 2048 ||
    typeof spec.axes !== 'boolean' ||
    typeof spec.grid !== 'boolean'
  )
    throw new PlotError('invalid_plot', 'Invalid graph expression or options.')
  for (const [object, keys] of [
    [spec.mathWindow, ['xMin', 'xMax', 'yMin', 'yMax']],
    [spec.frame, ['width', 'height']]
  ]) {
    if (!object || Object.keys(object).some((k) => !keys.includes(k)))
      throw new PlotError('invalid_plot', 'Invalid graph bounds or frame.')
  }
  createPlotTransform(spec.mathWindow, spec.frame)
  if (
    spec.frame.width < 80 ||
    spec.frame.height < 80 ||
    spec.frame.width > 2048 ||
    spec.frame.height > 2048
  )
    throw new PlotError('invalid_plot', 'Graph frame must be between 80 and 2048 pixels.')
  return spec
}
export function plotSemanticProps(spec) {
  const normalized = { ...spec, color: spec.color || 'auto', border: spec.border === undefined ? true : spec.border }
  return Object.fromEntries(PLOT_KEYS.map(k => [k, structuredClone(normalized[k])]))
}
