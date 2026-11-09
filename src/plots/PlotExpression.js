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

import { PlotError } from './PlotError.js'
import { validatePlotParameterSymbols } from './plotParameters.js'
export { PlotError } from './PlotError.js'

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

/** Discover Plot-local scalar symbols from the same bounded MathJSON grammar used by
 * the evaluator. This is an editor hint, never a replacement for final validation.
 */
export function discoverPlotParameterSymbols(latex) {
  checkInput(latex)
  const normalizedLatex = latex.trim().replace(/^(?:y\s*|f\s*\(\s*x\s*\)\s*)=\s*/, '')
  if (!engine) engine = new ComputeEngine()
  let ast
  try { ast = engine.parse(normalizedLatex, { canonical: false }).json }
  catch { fail('invalid_expression', 'LaTeX parsing failed') }
  const symbols = new Set()
  let nodes = 0
  function visit(node, depth = 0) {
    if (++nodes > 256 || depth > 32) fail('computation_limit', 'Expression complexity exceeds limit')
    if (typeof node === 'number' && Number.isFinite(node)) return
    if (typeof node === 'string') {
      if (['x', 'Pi', 'e', 'ExponentialE'].includes(node)) return
      validatePlotParameterSymbols([node])
      symbols.add(node)
      return
    }
    if (!Array.isArray(node)) fail('unsupported_expression', 'Unsupported numeric representation')
    const [op, ...args] = node
    if (op === 'Error') fail('invalid_expression', 'Invalid LaTeX')
    if (!((Object.hasOwn(unary, op) && args.length === 1)
      || (Object.hasOwn(binary, op) && args.length === 2)
      || (['Add', 'Multiply', 'InvisibleOperator'].includes(op)
        && args.length >= 2 && args.length <= 64))) {
      fail('unsupported_expression', 'Unsupported operator or arity: ' + op)
    }
    args.forEach(a => visit(a, depth + 1))
  }
  visit(ast)
  return validatePlotParameterSymbols([...symbols])
}

/** Parse once into bounded MathJSON-based evaluators, without assigning mutable
 * values on the shared CortexJS engine or rewriting the source LaTeX.
 * Numeric semantics use IEEE-754 Math, not Cortex symbolic evaluation.
 */
export function preparePlotExpression(latex, parameterSymbols = []) {
  checkInput(latex)
  const symbols = validatePlotParameterSymbols(parameterSymbols)
  const allowed = new Set(symbols), used = new Set()
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
      if (allowed.has(node)) {
        used.add(node)
        return (_x, values) => values[node]
      }
      fail('unsupported_expression', 'Undeclared or unsupported plot symbol')
    }
    if (!Array.isArray(node)) fail('unsupported_expression', 'Unsupported numeric representation')
    const [op, ...args] = node
    if (op === 'Error') fail('invalid_expression', 'Invalid LaTeX')
    let operation
    if (Object.hasOwn(unary, op) && args.length === 1) operation = v => unary[op](v[0])
    else if (Object.hasOwn(binary, op) && args.length === 2) operation = v => binary[op](...v)
    else if (['Add', 'Multiply', 'InvisibleOperator'].includes(op) && args.length >= 2 && args.length <= 64) {
      operation = v => op === 'Add' ? v.reduce((a, b) => a + b, 0) : v.reduce((a, b) => a * b, 1)
    } else fail('unsupported_expression', 'Unsupported operator or arity: ' + op)
    const children = args.map(a => visit(a, depth + 1))
    const evaluate = (x, values) => {
      const inputs = children.map(f => f(x, values))
      if (!inputs.every(Number.isFinite)) return NaN
      const value = operation(inputs)
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
    if (op === 'Tan') guards.push((x, values) => Math.cos(children[0](x, values)))
    return evaluate
  }
  const evaluate = visit(ast)
  if (used.size !== allowed.size) fail('unsupported_expression', 'Unused plot parameter declaration')
  return Object.freeze({
    latex, normalizedLatex, mathJson: ast, parameterSymbols: symbols,
    bind(values) {
      if (!values || typeof values !== 'object' || Array.isArray(values)
        || Object.keys(values).length !== symbols.length
        || symbols.some(symbol => !Object.hasOwn(values, symbol)
          || typeof values[symbol] !== 'number' || !Number.isFinite(values[symbol]))) {
        fail('invalid_plot', 'Plot parameter bindings must match declarations and be finite.')
      }
      const snapshot = Object.freeze(Object.assign(Object.create(null), values))
      return Object.freeze({
        latex, normalizedLatex, mathJson: ast,
        evaluate: x => Number.isFinite(x) ? evaluate(x, snapshot) : NaN,
        continuityGuards: x => guards.map(f => f(x, snapshot))
      })
    }
  })
}

/** Retain the parameterless plotting contract for existing consumers. */
export function parsePlotExpression(latex) {
  return preparePlotExpression(latex).bind({})
}
