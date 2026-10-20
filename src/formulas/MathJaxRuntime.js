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

import { FormulaRenderError } from './FormulaRenderError.js'

/**
 * Lazy MathJax browser runtime. Owns LaTeX → standalone SVG only.
 */
export class MathJaxRuntime {
  constructor({ loadEngine } = {}) {
    this._enginePromise = null
    this._loadEngine = loadEngine || defaultLoadEngine
  }

  async getEngine() {
    if (!this._enginePromise) {
      this._enginePromise = this._loadEngine().catch((error) => {
        this._enginePromise = null
        throw new FormulaRenderError('Unable to initialize MathJax', {
          stage: 'mathjax_init',
          cause: error,
        })
      })
    }
    return this._enginePromise
  }

  async renderSvg(latex) {
    let svg
    try {
      const engine = await this.getEngine()
      svg = await engine.renderSvg(latex)
    } catch (error) {
      if (error instanceof FormulaRenderError) throw error
      throw new FormulaRenderError('Unable to typeset formula with MathJax', {
        stage: 'mathjax_typeset',
        cause: error,
      })
    }

    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      throw new FormulaRenderError('MathJax produced empty SVG', {
        stage: 'svg_prepare',
      })
    }

    if (containsMathJaxError(svg)) {
      throw new FormulaRenderError('Invalid TeX formula', {
        stage: 'mathjax_typeset',
      })
    }

    return svg
  }
}

function defaultLoadEngine() {
  return import('./mathjaxBrowserEngine.js').then((module) =>
    module.createMathJaxBrowserEngine(),
  )
}

function containsMathJaxError(svg) {
  // Standalone CSS mentions merror selectors; inspect markup only.
  const markup = svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  return (
    markup.includes('data-mml-node="merror"')
    || markup.includes("data-mml-node='merror'")
    || /<merror[\s>]/i.test(markup)
  )
}
