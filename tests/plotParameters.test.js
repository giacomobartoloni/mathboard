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

import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePlotExpression, parsePlotExpression } from '../src/plots/PlotExpression.js'
import { validatePlotParameters } from '../src/plots/plotParameters.js'
import { samplePlot } from '../src/plots/PlotSampler.js'
import { computePlot } from '../src/plots/computePlot.js'
import { DEFAULT_PLOT } from '../src/plots/plotSpec.js'

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, String(actual) + ' != ' + String(expected))
const p = (symbol, value = 1) => ({ symbol, value, min: -10, max: 10, step: 0.1 })
const window = { xMin: -2, xMax: 2, yMin: -10, yMax: 10 }

test('pinned CortexJS MathJSON accepts explicit scalar factors and immutable snapshots', () => {
  const prepared = preparePlotExpression('y=a\\cdot x^2+b\\cdot x+c', ['a', 'b', 'c'])
  assert.equal(prepared.normalizedLatex, 'a\\cdot x^2+b\\cdot x+c')
  assert.equal(prepared.parameterSymbols.length, 3)
  const values = { a: 2, b: -3, c: 1 }
  const first = prepared.bind(values)
  close(first.evaluate(2), 3)
  values.a = -10
  close(first.evaluate(2), 3)
  const second = prepared.bind({ a: -1, b: 2, c: 0 })
  close(second.evaluate(1), 1)
  close(first.evaluate(2), 3)
  assert.equal(prepared.latex, 'y=a\\cdot x^2+b\\cdot x+c')
  assert.notEqual(prepared.mathJson, null)
})

test('pinned grammar parses conventional juxtaposed coefficient notation', () => {
  const implicit = preparePlotExpression('ax^2+bx+c', ['a', 'b', 'c'])
  const explicit = preparePlotExpression('a\cdot x^2+b\cdot x+c', ['a', 'b', 'c'])
  const values = { a: 2, b: -3, c: 1 }
  close(implicit.bind(values).evaluate(2), explicit.bind(values).evaluate(2))
})

test('five local parameters are supported without a three-slider semantic limit', () => {
  const prepared = preparePlotExpression(
    'a\\cdot x^4+b\\cdot x^3+c\\cdot x^2+d\\cdot x+f',
    ['a', 'b', 'c', 'd', 'f'])
  close(prepared.bind({ a: 1, b: 2, c: 3, d: 4, f: 5 }).evaluate(2), 57)
  assert.deepEqual(validatePlotParameters(['a', 'b', 'c', 'd', 'f'].map(s => p(s))),
    ['a', 'b', 'c', 'd', 'f'])
})

test('moving rational poles and trigonometric coefficients use the same binding', () => {
  const prepared = preparePlotExpression('1/(x-a)', ['a'])
  for (const pole of [-0.5, 0.5]) {
    const bound = prepared.bind({ a: pole })
    assert.ok(Number.isNaN(bound.evaluate(pole)))
    close(bound.continuityGuards(pole)[0], 0)
    const result = samplePlot(bound, window)
    assert.ok(result.segments.length > 0)
    for (const segment of result.segments)
      assert.ok(segment.every(point => point.x < pole) || segment.every(point => point.x > pole))
  }
  const trig = preparePlotExpression('\\sin(a\\cdot x)', ['a'])
  close(trig.bind({ a: 2 }).evaluate(Math.PI / 4), 1)
  close(trig.bind({ a: 1 }).evaluate(Math.PI / 2), 1)
})

test('parameter domain changes preserve NaN and render valid-empty graphs', () => {
  const pwr = preparePlotExpression('x^a', ['a'])
  assert.ok(Number.isNaN(pwr.bind({ a: 0.5 }).evaluate(-1)))
  close(pwr.bind({ a: 2 }).evaluate(-1), 1)
  const spec = { ...DEFAULT_PLOT, latex: '\\sqrt{x-a}',
    mathWindow: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    parameters: [p('a', 3)] }
  const output = computePlot(spec)
  assert.equal(output.status, 'no_real_samples')
  assert.equal(output.curves.length, 0)
  assert.throws(() => computePlot({ ...spec, parameters: undefined, latex: '\\sqrt{-1}' }),
    { code: 'no_real_samples' })
})

test('undeclared, duplicate, unused and invalid numeric parameters reject deterministically', () => {
  assert.throws(() => preparePlotExpression('a\\cdot x', []), { code: 'unsupported_expression' })
  assert.throws(() => preparePlotExpression('a\\cdot x', ['a', 'b']), { code: 'unsupported_expression' })
  for (const symbols of [['a', 'a'], ['x'], ['e'], ['i'], ['y'], ['a', '__proto__']]) {
    assert.throws(() => preparePlotExpression('x', symbols), { code: 'invalid_plot' })
  }
  for (const definition of [
    { ...p('a'), value: NaN }, { ...p('a'), min: 0, max: 0 },
    { ...p('a'), step: 0 }, { ...p('a'), value: 11 },
    { ...p('a'), step: 0.00001 }, { ...p('a'), min: Infinity },
    { ...p('a'), extra: 1 }, { ...p('x') }
  ]) assert.throws(() => validatePlotParameters([definition]), { code: 'invalid_plot' })
  assert.throws(() => validatePlotParameters([p('a'), p('a')]), { code: 'invalid_plot' })
  assert.throws(() => validatePlotParameters(null), { code: 'invalid_plot' })
  const prepared = preparePlotExpression('a\\cdot x', ['a'])
  for (const values of [{}, { a: 1, b: 2 }, { a: Infinity }, { a: '1' }]) {
    assert.throws(() => prepared.bind(values), { code: 'invalid_plot' })
  }
  close(parsePlotExpression('x^2').evaluate(3), 9)
})
