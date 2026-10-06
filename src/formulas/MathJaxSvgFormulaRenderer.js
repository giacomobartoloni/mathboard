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

import { loadSVGFromString } from 'fabric'
import { FormulaObject } from './FormulaObject.js'
import { FormulaRenderError } from './FormulaRenderError.js'
import { INK_MODE_AUTO } from '../config/themes.js'

/**
 * Board formula renderer: MathJax SVG → Fabric vector FormulaObject.
 * Contract matches the previous KaTeX bitmap renderer (`render` / `syncInk`).
 * `html` and `inkIsLight` are ignored (compat with current DrawBoard caller).
 */
export class MathJaxSvgFormulaRenderer {
  constructor(mathJaxRuntime) {
    this.mathJaxRuntime = mathJaxRuntime
  }

  async render({ latex, position, ink }) {
    // `html` / `inkIsLight` from DrawBoard are intentionally ignored.
    let svg
    try {
      svg = await this.mathJaxRuntime.renderSvg(latex)
    } catch (error) {
      if (error instanceof FormulaRenderError) throw error
      throw wrapError('mathjax_typeset', error)
    }

    let parsed
    try {
      parsed = await loadSVGFromString(svg)
    } catch (error) {
      throw wrapError('fabric_svg_parse', error)
    }

    const children = (parsed.objects || []).filter(Boolean)
    if (!children.length) {
      throw new FormulaRenderError('Formula SVG produced no Fabric objects', {
        stage: 'formula_materialize',
      })
    }

    const formula = FormulaObject.fromParsedSvg(children, parsed.options, {
      latex,
      left: position.x,
      top: position.y,
      mathboardInkMode: INK_MODE_AUTO,
    })

    if (
      !Number.isFinite(formula.width)
      || !Number.isFinite(formula.height)
      || formula.width <= 0
      || formula.height <= 0
    ) {
      throw new FormulaRenderError('Formula has invalid dimensions', {
        stage: 'formula_materialize',
      })
    }

    formula.applyInk(ink)
    formula.setCoords()
    return formula
  }

  /**
   * Theme AUTO ink: recolor existing vector paint. No MathJax rerun.
   * @returns {boolean}
   */
  syncInk(formula, config) {
    return Boolean(formula?.applyInk?.(config.defaultInk))
  }
}

function wrapError(stage, error) {
  return new FormulaRenderError('Unable to render formula SVG', {
    stage,
    cause: error,
  })
}
