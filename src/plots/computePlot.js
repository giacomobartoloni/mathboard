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

import { parsePlotExpression, preparePlotExpression } from './PlotExpression.js'
import { validatePlotParameters } from './plotParameters.js'
import { samplePlot } from './PlotSampler.js'
import { createPlotTransform, clipMathSegment } from './PlotGeometry.js'
import { validatePlotSpec } from './plotSpec.js'
import { PlotError } from './PlotError.js'

export function computePlot(spec) {
  validatePlotSpec(spec)
  const symbols = validatePlotParameters(spec.parameters)
  const values = Object.fromEntries((spec.parameters || []).map(p => [p.symbol, p.value]))
  const expression = symbols.length
    ? preparePlotExpression(spec.latex, symbols).bind(values)
    : parsePlotExpression(spec.latex)
  const result = samplePlot(expression, spec.mathWindow)
  if (result.status === 'no_real_samples' && symbols.length === 0)
    throw new PlotError(
      'no_real_samples',
      'No real points found in this interval. Try a different expression or range.'
    )
  if (result.status === 'computation_limit')
    throw new PlotError(
      'computation_limit',
      'This graph needs too much computation. Try a smaller interval or simpler expression.'
    )
  const t = createPlotTransform(spec.mathWindow, spec.frame),
    curves = [],
    dots = []
  const point = (p) => {
    const q = t.toFrame(p)
    return `${q.x.toFixed(3)} ${q.y.toFixed(3)}`
  }
  const seenDots = new Set()
  for (const segment of result.segments) {
    if (segment.length === 1) {
      const p = segment[0],
        key = `${p.x},${p.y}`
      if (
        p.x >= spec.mathWindow.xMin &&
        p.x <= spec.mathWindow.xMax &&
        p.y >= spec.mathWindow.yMin &&
        p.y <= spec.mathWindow.yMax &&
        !seenDots.has(key)
      ) {
        dots.push(t.toFrame(p))
        seenDots.add(key)
      }
    }
    let path = '',
      last = null
    for (let i = 1; i < segment.length; i++) {
      const clipped = clipMathSegment(segment[i - 1], segment[i], spec.mathWindow)
      if (!clipped) {
        last = null
        continue
      }
      const a = point(clipped[0]),
        b = point(clipped[1])
      path += (last === a ? '' : ' M ' + a) + ' L ' + b
      last = b
    }
    if (path) curves.push(path.trim())
  }
  const w = spec.mathWindow,
    grid = [],
    axes = [],
    labels = []
  const xZero = Math.max(0, Math.min(spec.frame.width, t.toFrame({ x: 0, y: 0 }).x))
  const yZero = Math.max(0, Math.min(spec.frame.height, t.toFrame({ x: 0, y: 0 }).y))
  const step = (span) => {
    const n = 10 ** Math.floor(Math.log10(span / 8))
    return [1, 2, 5, 10].map((v) => v * n).find((v) => v >= span / 10)
  }
  const sx = step(w.xMax - w.xMin),
    sy = step(w.yMax - w.yMin)
  const showNumbers = spec.axes && spec.axisNumbers !== false
  // Keep one-pixel grid strokes off the perimeter, including decimal roundoff.
  const gridInset = 0.5
  // Bound attempts independently of emitted strokes and stop unrepresentable tick increments.
  for (let n = Math.ceil(w.xMin / sx), ticks = 0; n * sx <= w.xMax && ticks < 64; n++, ticks++) {
    if (n + 1 === n) break
    const value = n * sx,
      x = t.toFrame({ x: value, y: 0 }).x
    if (x > gridInset && x < spec.frame.width - gridInset)
      grid.push(`M ${x} 0 L ${x} ${spec.frame.height}`)
    if (value !== 0 && showNumbers)
      labels.push({
        text: Number(value.toPrecision(4)).toString(),
        x: Math.max(16, Math.min(spec.frame.width - 16, x)),
        y: Math.max(16, Math.min(spec.frame.height - 8, yZero + 16))
      })
  }
  for (let n = Math.ceil(w.yMin / sy), ticks = 0; n * sy <= w.yMax && ticks < 64; n++, ticks++) {
    if (n + 1 === n) break
    const value = n * sy,
      y = t.toFrame({ x: 0, y: value }).y
    if (y > gridInset && y < spec.frame.height - gridInset)
      grid.push(`M 0 ${y} L ${spec.frame.width} ${y}`)
    if (value !== 0 && showNumbers)
      labels.push({
        text: Number(value.toPrecision(4)).toString(),
        x: Math.max(16, Math.min(spec.frame.width - 16, xZero + 18)),
        y: Math.max(14, Math.min(spec.frame.height - 8, y))
      })
  }
  if (spec.axes && w.xMin <= 0 && w.xMax >= 0)
    axes.push(`M ${xZero} 0 L ${xZero} ${spec.frame.height}`)
  if (spec.axes && w.yMin <= 0 && w.yMax >= 0)
    axes.push(`M 0 ${yZero} L ${spec.frame.width} ${yZero}`)
  return {
    curves,
    dots,
    grid: spec.grid ? grid : [],
    axes,
    labels,
    status: result.status,
    isotropic: t.isotropic,
    diagnostics: result.diagnostics
  }
}
