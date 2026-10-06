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

import { mathjax } from '@mathjax/src/js/mathjax.js'
import { TeX } from '@mathjax/src/js/input/tex.js'
import { SVG } from '@mathjax/src/js/output/svg.js'
import { browserAdaptor } from '@mathjax/src/js/adaptors/browserAdaptor.js'
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js'

// Side-effect imports register TeX package configurations (no CDN / \require).
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js'
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js'
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js'
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js'
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js'

/** Board visual size target ≈ previous KaTeX 15px (not the old html2canvas scale:2). */
export const MATHJAX_EM_PX = 15
export const MATHJAX_EX_PX = 7.5

const TEX_PACKAGES = Object.freeze([
  'base',
  'ams',
  'newcommand',
  'noundefined',
  'textmacros',
])

const SVG_CSS = [
  'svg a{fill:blue;stroke:blue}',
  '[data-mml-node="merror"]>g{fill:red;stroke:red}',
  '[data-mml-node="merror"]>rect[data-background]{fill:yellow;stroke:none}',
  '[data-frame],[data-line]{stroke-width:70px;fill:none}',
  '.mjx-dashed{stroke-dasharray:140}',
  '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
  'use[data-c]{stroke-width:3px}',
].join('')

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Shared engine factory. Browser production uses browserAdaptor; unit tests may
 * pass liteAdaptor for node:test without a DOM.
 *
 * @param {object} adaptor MathJax DOM adaptor
 */
export function createMathJaxEngine(adaptor) {
  RegisterHTMLHandler(adaptor)

  return {
    /**
     * Convert LaTeX to a standalone SVG string (explicit paths, black paint).
     * Fresh TeX/document per call so macros do not leak across formulas.
     */
    async renderSvg(latex) {
      const doc = mathjax.document('', {
        InputJax: new TeX({ packages: [...TEX_PACKAGES] }),
        OutputJax: new SVG({ fontCache: 'none' }),
      })

      const node = await doc.convertPromise(latex, {
        display: true,
        em: MATHJAX_EM_PX,
        ex: MATHJAX_EX_PX,
      })

      return prepareStandaloneSvg(adaptor, node)
    },
  }
}

export function createMathJaxBrowserEngine() {
  return createMathJaxEngine(browserAdaptor())
}

function prepareStandaloneSvg(adaptor, container) {
  const svg = adaptor.tags(container, 'svg')[0]
  if (!svg) {
    throw new Error('MathJax produced no SVG element')
  }

  const widthAttr = adaptor.getAttribute(svg, 'width') || ''
  const heightAttr = adaptor.getAttribute(svg, 'height') || ''
  const widthEx = parseFloat(widthAttr)
  const heightEx = parseFloat(heightAttr)

  if (Number.isFinite(widthEx) && String(widthAttr).includes('ex')) {
    adaptor.setAttribute(svg, 'width', String(widthEx * MATHJAX_EX_PX))
  }
  if (Number.isFinite(heightEx) && String(heightAttr).includes('ex')) {
    adaptor.setAttribute(svg, 'height', String(heightEx * MATHJAX_EX_PX))
  }

  const defs =
    adaptor.tags(svg, 'defs')[0]
    || adaptor.append(svg, adaptor.node('defs', {}, [], SVG_NS))

  adaptor.append(
    defs,
    adaptor.node('style', {}, [adaptor.text(SVG_CSS)], SVG_NS),
  )

  adaptor.removeAttribute(svg, 'role')
  adaptor.removeAttribute(svg, 'focusable')
  adaptor.removeAttribute(svg, 'aria-hidden')

  const g = adaptor.tags(svg, 'g')[0]
  if (g) {
    adaptor.setAttribute(g, 'stroke', 'black')
    adaptor.setAttribute(g, 'fill', 'black')
  }

  return adaptor.serializeXML(svg)
}
