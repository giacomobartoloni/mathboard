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
import { validateMathWindow } from './PlotGeometry.js'

/** Deterministic bounded sampling in mathematical coordinates. Finite probes
 * cannot prove universal continuity or resolve arbitrary high-frequency input.
 * Suspected or unresolved intervals are gaps, never fallback connecting chords.
 * Clip accepted chords with clipMathSegment before rendering.
 */
export function samplePlot(expression, window, options = {}) {
  validateMathWindow(window)
  const { intervals = 64, maxEvaluations = 16385, maxDepth = 10, maxPoints = 16385, tolerance = 0.001 } = options
  if (!Number.isInteger(intervals) || intervals < 4 || intervals > 1024 ||
    !Number.isInteger(maxEvaluations) || maxEvaluations < 3 || maxEvaluations > 32769 ||
    !Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > 32769 ||
    !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 12 ||
    !Number.isFinite(tolerance) || tolerance < 1e-6 || tolerance > 0.1) {
    throw new PlotError('computation_limit', 'Invalid sampling budget')
  }
  const diagnostics = { evaluations: 0, invalidSamples: 0, unresolvedIntervals: 0, suspectedDiscontinuities: 0 }
  const segments = [], cache = new Map()
  let current = null, exhausted = false, pointCount = 0
  function probe(x) {
    if (cache.has(x)) return cache.get(x)
    if (diagnostics.evaluations >= maxEvaluations) { exhausted = true; return null }
    diagnostics.evaluations++
    let y, guards
    try { y = expression.evaluate(x); guards = expression.continuityGuards?.(x) || [] }
    catch { throw new PlotError('evaluator_failure', 'Numeric evaluator failed') }
    if (!Number.isFinite(y)) diagnostics.invalidSamples++
    const point = { x, y, guards }
    cache.set(x, point)
    return point
  }
  function gap() { current = null }
  function accept(a, b) {
    const needed = !current || current.at(-1).x !== a.x ? 2 : 1
    if (pointCount + needed > maxPoints) { exhausted = true; gap(); return }
    pointCount += needed
    if (!current || current.at(-1).x !== a.x) {
      current = [{x: a.x, y: a.y}]
      segments.push(current)
    }
    current.push({x: b.x, y: b.y})
  }
  function crosses(a, b) {
    return a.guards.some((v, i) => !Number.isFinite(v) || !Number.isFinite(b.guards[i]) ||
      v === 0 || b.guards[i] === 0 || Math.sign(v) !== Math.sign(b.guards[i]))
  }
  function refine(a, b, depth) {
    if (exhausted || !a || !b) { diagnostics.unresolvedIntervals++; gap(); return }
    const mid = (a.x + b.x) / 2
    const m = probe(mid)
    if (!m) { diagnostics.unresolvedIntervals++; gap(); return }
    const valid = [a, m, b].map(p => Number.isFinite(p.y))
    if (valid.every(v => !v)) { gap(); return }
    const pole = crosses(a, m) || crosses(m, b)
    const error = Math.abs(m.y - (a.y / 2 + b.y / 2)) / (window.yMax - window.yMin)
    if (valid.every(Boolean) && !pole && error <= tolerance) {
      accept(a, m); accept(m, b); return
    }
    if (depth >= maxDepth || mid === a.x || mid === b.x) {
      diagnostics.unresolvedIntervals++
      if (pole) diagnostics.suspectedDiscontinuities++
      gap()
      // Preserve finite boundary observations as isolated points, never chords.
      for (const p of [a, m, b]) {
        if (Number.isFinite(p.y)) {
          if (pointCount >= maxPoints) { exhausted = true; break }
          segments.push([{x: p.x, y: p.y}]); pointCount++
        }
      }
      return
    }
    refine(a, m, depth + 1)
    refine(m, b, depth + 1)
  }
  for (let i = 0; i < intervals; i++) {
    const x = window.xMin + (window.xMax - window.xMin) * i / intervals
    const next = i + 1 === intervals ? window.xMax : window.xMin + (window.xMax - window.xMin) * (i + 1) / intervals
    refine(probe(x), probe(next), 0)
    if (exhausted) break
  }
  return { segments, domain: {...window}, diagnostics,
    status: exhausted ? 'computation_limit' : segments.length ? (diagnostics.unresolvedIntervals ? 'partial' : 'ok') : 'no_real_samples' }
}
