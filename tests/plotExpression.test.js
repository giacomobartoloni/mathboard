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
import { ComputeEngine } from '@cortex-js/compute-engine'
import { parsePlotExpression, PlotError } from '../src/plots/PlotExpression.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)

test('LaTeX polynomial preserves roots, vertex, implicit multiplication and original source', () => {
  const p = parsePlotExpression(' y = x^2-5x+6 ')
  assert.equal(p.latex, ' y = x^2-5x+6 ')
  assert.equal(p.normalizedLatex, 'x^2-5x+6')
  for (const [x, y] of [[2, 0], [3, 0], [2.5, -0.25], [0, 6]]) close(p.evaluate(x), y)
  close(parsePlotExpression('f(x)=x^2').evaluate(3), 9)
})

test('supported real grammar agrees with hand values and pinned Cortex numerical evaluation', () => {
  const ce = new ComputeEngine()
  for (const [s, x, y] of [
    ['\\frac{1}{x}', 2, 0.5], ['\\sqrt{x}', 4, 2], ['\\log(x)', 100, 2],
    ['\\ln(x)', Math.E, 1], ['\\sin(x)', Math.PI / 2, 1], ['\\cos(x)', 0, 1],
    ['\\tan(x)', Math.PI / 4, 1], ['e^x', 1, Math.E], ['\\pi', 0, Math.PI],
    ['\\frac{1}{2}x', 3, 1.5], ['2(x+1)', 2, 6], ['\\exp(x)', 0, 1]
  ]) {
    close(parsePlotExpression(s).evaluate(x), y)
    // e is deliberately normalized to Euler's constant, not an unknown CE symbol.
    if (s !== 'e^x') close(Number(ce.parse(s).subs({ x }).N().toString()), y)
  }
})

test('rejects unsupported syntax and variables before they can fabricate a graph', () => {
  for (const s of ['', 'x+', '\\bad{x}', 'x+y', 'x-x+y-y', '\\int x dx',
    '\\sum_{n=1}^{10}n', '\\begin{matrix}1&2\\end{matrix}', 'i',
    'x^2+y^2=1', 'x<1', '\\sqrt[3]{x}', '\\log_2(x)', 'x!', '\\text{x}', 'x;2']) {
    assert.throws(() => parsePlotExpression(s), e => e instanceof PlotError &&
      ['invalid_expression', 'unsupported_expression'].includes(e.code), s)
  }
})

test('input depth, size and AST work are bounded before numeric evaluation', () => {
  for (const s of ['x'.repeat(2049), '('.repeat(40)+'x'+')'.repeat(40),
    'x+'.repeat(300)+'x', '9'.repeat(100)]) {
    assert.throws(() => parsePlotExpression(s), e => e instanceof PlotError, s.slice(0, 20))
  }
})

test('invalid child domains survive noncanonical parsing and evaluation', () => {
  for (const s of ['x/x', '0(1/x)', '(1/x)^0', '\\sqrt{x}^2']) {
    assert.ok(Number.isNaN(parsePlotExpression(s).evaluate(s.includes('sqrt') ? -1 : 0)), s)
  }
  assert.ok(Number.isNaN(parsePlotExpression('0^0').evaluate(0)))
  assert.ok(Number.isNaN(parsePlotExpression('(-8)^{1/3}').evaluate(0)))
  assert.ok(Number.isNaN(parsePlotExpression('x').evaluate(Infinity)))
})

test('rejects unmatched delimiters before invoking the parser', () => {
  for(const s of [')'.repeat(40)+'('.repeat(40)+'x'+')'.repeat(40), '(x}', '{x', 'x)']) {
    assert.throws(()=>parsePlotExpression(s),e=>e.code==='invalid_expression' && e.message.includes('delimiter'))
  }
})
