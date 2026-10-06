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

import { FabricImage, filters } from 'fabric'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import html2canvas from 'html2canvas'
import { FORMULA_TYPE } from './constants.js'
import { FormulaRenderError } from './FormulaRenderError.js'
import { INK_MODE_AUTO } from '../config/themes.js'

/**
 * Legacy bitmap formula renderer: KaTeX HTML → html2canvas → FabricImage.
 * Intended to be replaced by a MathJax SVG renderer that preserves the same
 * `render` / `syncInk` contract.
 */
export class KaTeXBitmapFormulaRenderer {
  async render({
    latex,
    position,
    ink,
    inkIsLight,
    html = null,
  }) {
    const markup = this._renderMarkup(latex, html)
    const tempDiv = this._createTempDiv({ markup, ink })

    document.body.appendChild(tempDiv)

    try {
      await this._waitForLayout()

      let renderedCanvas
      try {
        renderedCanvas = await html2canvas(tempDiv, {
          backgroundColor: null,
          scale: 2,
          logging: false,
        })
      } catch (error) {
        throw new FormulaRenderError('Unable to render formula bitmap', {
          stage: 'canvas_render',
          cause: error,
        })
      }

      const image = new FabricImage(renderedCanvas, {
        left: position.x,
        top: position.y,
        originX: 'left',
        originY: 'top',
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockMovementX: false,
        lockMovementY: false,
        lockRotation: false,
        lockScalingX: false,
        lockScalingY: false,
        lockScalingFlip: false,
        lockSkewingX: false,
        lockSkewingY: false,
      })

      image.latex = latex
      image.formulaType = FORMULA_TYPE
      image.mathboardInkMode = INK_MODE_AUTO
      image.mathboardRenderedInkIsLight = inkIsLight

      return image
    } finally {
      tempDiv.remove()
    }
  }

  /**
   * Adapt a formula bitmap to the board ink polarity. Fabric filters never
   * mutate the source element, so dropping the filter restores the original.
   * @returns {boolean} true when filters changed
   */
  syncInk(formula, config) {
    const shouldInvert =
      Boolean(formula.mathboardRenderedInkIsLight) !== config.inkIsLight

    const isInverted =
      formula.filters?.some((filter) => filter.type === 'Invert') ?? false

    if (shouldInvert === isInverted) {
      return false
    }

    formula.filters = shouldInvert ? [new filters.Invert()] : []
    formula.applyFilters()
    return true
  }

  _renderMarkup(latex, html) {
    if (typeof html === 'string' && html) {
      return html
    }

    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: true,
        strict: false,
      })
    } catch (error) {
      throw new FormulaRenderError('Unable to render formula markup', {
        stage: 'katex_render',
        cause: error,
      })
    }
  }

  _createTempDiv({ markup, ink }) {
    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'absolute'
    tempDiv.style.left = '-9999px'
    tempDiv.style.fontSize = '15px'
    tempDiv.style.padding = '10px'
    tempDiv.style.backgroundColor = 'transparent'
    tempDiv.style.color = ink
    tempDiv.innerHTML = markup
    return tempDiv
  }

  /**
   * Legacy layout wait (previously Vue nextTick + 100ms). Kept for visual
   * parity with the bitmap pipeline; MathJax will remove this delay.
   */
  _waitForLayout() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 100)
      })
    })
  }
}
