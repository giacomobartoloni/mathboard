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

// Bound by the existing 256-node Plot interpreter budget, not a UI slider count.
export const PLOT_PARAMETER_BUDGET = 256
export const PLOT_PARAMETER_TICK_BUDGET = 10000
export const PLOT_PARAMETER_MAGNITUDE = 1e12
export const PLOT_PARAMETER_SYMBOL_PATTERN = '^[a-z][a-zA-Z0-9]{0,31}$'
const namePattern = new RegExp(PLOT_PARAMETER_SYMBOL_PATTERN)
const reserved = new Set(['x', 'y', 'e', 'i', 'Pi', 'ExponentialE',
  'NaN', 'Infinity', 'True', 'False'])

function invalid(message) {
  throw new PlotError('invalid_plot', message)
}

/** Validate declarations without touching LaTeX or the ComputeEngine symbol table. */
export function validatePlotParameterSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length > PLOT_PARAMETER_BUDGET)
    invalid('Invalid parameter symbol collection.')
  const seen = new Set()
  for (const symbol of symbols) {
    if (typeof symbol !== 'string' || !namePattern.test(symbol) || reserved.has(symbol) || seen.has(symbol))
      invalid('Invalid, duplicate or reserved plot parameter symbol.')
    seen.add(symbol)
  }
  return Object.freeze([...symbols])
}

/** Parameters are per-Plot finite real values with a UI range and slider step. */
export function validatePlotParameters(parameters) {
  if (parameters === undefined) return Object.freeze([])
  if (!Array.isArray(parameters)) invalid('Plot parameters must be an array.')
  const symbols = validatePlotParameterSymbols(parameters.map(parameter => parameter?.symbol))
  for (const parameter of parameters) {
    if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)
      || Object.keys(parameter).some(key => !['symbol', 'value', 'min', 'max', 'step'].includes(key))
      || !['value', 'min', 'max', 'step'].every(key => typeof parameter[key] === 'number'
        && Number.isFinite(parameter[key]) && Math.abs(parameter[key]) <= PLOT_PARAMETER_MAGNITUDE)
      || parameter.min >= parameter.max
      || parameter.value < parameter.min || parameter.value > parameter.max
      || parameter.step <= 0
      || !Number.isFinite(parameter.max - parameter.min)
      || (parameter.max - parameter.min) / parameter.step > PLOT_PARAMETER_TICK_BUDGET) {
      invalid('Invalid plot parameter value, range or step.')
    }
  }
  return symbols
}
