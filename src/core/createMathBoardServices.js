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

import { BoardObjectPolicy } from '../board/BoardObjectPolicy.js'
import { MathJaxRuntime } from '../formulas/MathJaxRuntime.js'
import { MathJaxSvgFormulaRenderer } from '../formulas/MathJaxSvgFormulaRenderer.js'

/**
 * Application services composed at bootstrap. Callers should receive these
 * via provide/inject — do not import a production singleton from here.
 */
export function createMathBoardServices() {
  const boardObjectPolicy = new BoardObjectPolicy()
  const mathJaxRuntime = new MathJaxRuntime()
  const formulaRenderer = new MathJaxSvgFormulaRenderer(mathJaxRuntime)

  return {
    boardObjectPolicy,
    formulaRenderer,
  }
}
