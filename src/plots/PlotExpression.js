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

import { ComputeEngine } from '@cortex-js/compute-engine'

export class PlotError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PlotError'
    this.code = code
  }
}

const fail = (code, message) => { throw new PlotError(code, message) }
let engine
const unary = { Negate: a => -a, Delimiter: a => a, Sqrt: Math.sqrt,
  Sin: Math.sin, Cos: Math.cos, Tan: Math.tan, Ln: Math.log, Log: Math.log10, Exp: Math.exp }
const binary = { Subtract: (a, b) => a - b, Divide: (a, b) => b === 0 ? NaN : a / b,
  Power: (a, b) => a === 0 && b === 0 ? NaN : Math.pow(a, b) }
const commands = new Set(['frac', 'sqrt', 'sin', 'cos', 'tan', 'ln', 'log', 'exp', 'pi', 'left', 'right', 'cdot', 'times'])

function checkInput(latex) {
  if (typeof latex !== 'string' || !latex.trim()) fail('invalid_expression', 'Expected LaTeX expression')
  if (latex.length > 2048) fail('computation_limit', 'LaTeX length exceeds limit')
  const delimiters = []
  for (const c of latex) {
    if ('({['.includes(c)) {
      delimiters.push(c)
      if (delimiters.length > 32) fail('computation_limit', 'Input nesting exceeds limit')
    }
    if (')}]'.includes(c) && delimiters.pop() !== '({['[')}]'.indexOf(c)]) {
      fail('invalid_expression', 'Unmatched delimiter')
    }
  }
  if (delimiters.length) fail('invalid_expression', 'Unmatched delimiter')
  if (/\d{16}/.test(latex)) fail('computation_limit', 'Numeric literal exceeds precision policy')
  for (const match of latex.matchAll(/\\([a-zA-Z]+|.)/g)) {
    if (!commands.has(match[1]) && ![',', '!', ' '].includes(match[1])) {
      fail('unsupported_expression', 'Unsupported LaTeX command')
    }
  }
}

/** Parse without canonical simplification; evaluate only a bounded scalar subset.
 * Numeric semantics use IEEE-754 Math, not the Cortex symbolic evaluator.
 * No compile(), eval(), or dynamic Function construction is used.
 */
export function parsePlotExpression(latex) {
  checkInput(latex)
  const normalizedLatex = latex.trim().replace(/^(?:y\s*|f\s*\(\s*x\s*\)\s*)=\s*/, '')
  if (!engine) engine = new ComputeEngine()
  let ast
  try { ast = engine.parse(normalizedLatex, { canonical: false }).json }
  catch { fail('invalid_expression', 'LaTeX parsing failed') }
  let nodes = 0
  const guards = []
  function visit(node, depth = 0) {
    if (++nodes > 256 || depth > 32) fail('computation_limit', 'Expression complexity exceeds limit')
    if (typeof node === 'number' && Number.isFinite(node)) return () => node
    if (typeof node === 'string') {
      if (node === 'x') return x => x
      if (node === 'Pi') return () => Math.PI
      if (node === 'e' || node === 'ExponentialE') return () => Math.E
      fail('unsupported_expression', 'Only x and approved real constants are supported')
    }
    if (!Array.isArray(node)) fail('unsupported_expression', 'Unsupported numeric representation')
    const [op, ...args] = node
    if (op === 'Error') fail('invalid_expression', 'Invalid LaTeX')
    let operation
    if (Object.hasOwn(unary, op) && args.length === 1) operation = v => unary[op](v[0])
    else if (Object.hasOwn(binary, op) && args.length === 2) operation = v => binary[op](...v)
    else if (['Add', 'Multiply', 'InvisibleOperator'].includes(op) && args.length >= 2 && args.length <= 64) {
      operation = v => op === 'Add' ? v.reduce((a, b) => a + b, 0) : v.reduce((a, b) => a * b, 1)
    } else fail('unsupported_expression', `Unsupported operator or arity: ${op}`)
    const children = args.map(a => visit(a, depth + 1))
    const evaluate = x => {
      const values = children.map(f => f(x))
      if (!values.every(Number.isFinite)) return NaN
      const value = operation(values)
      return Number.isFinite(value) ? value : NaN
    }
    // Track zero sets in divisors, including even powers and products.
    function divisorFactors(n) {
      if (Array.isArray(n) && ['Power', 'Delimiter'].includes(n[0])) return divisorFactors(n[1])
      if (Array.isArray(n) && ['Multiply', 'InvisibleOperator'].includes(n[0])) return n.slice(1).flatMap(divisorFactors)
      return [n]
    }
    const guarded = op === 'Divide' ? args[1]
      : ['Sqrt', 'Ln', 'Log'].includes(op) ||
        (op === 'Power' && !(Number.isInteger(args[1]) && args[1] > 0)) ? args[0] : null
    if (guarded !== null) {
      for (const factor of divisorFactors(guarded)) guards.push(visit(factor, depth + 1))
    }
    if (op === 'Tan') guards.push(x => Math.cos(children[0](x)))
    return evaluate
  }
  const evaluate = visit(ast)
  return Object.freeze({ latex, normalizedLatex, mathJson: ast,
    evaluate: x => Number.isFinite(x) ? evaluate(x) : NaN,
    continuityGuards: x => guards.map(f => f(x)) })
}
