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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { LATEX_EXAMPLES, LATEX_WHITEBOARD_FEATURED } from '../data/latex-examples.mjs'
import { renderOpenBoardCTA } from '../lib/render-components.mjs'
import { renderFormulaExample } from '../lib/katex-render.mjs'

const featured = LATEX_WHITEBOARD_FEATURED.map((source) => {
  const match = LATEX_EXAMPLES.find((item) => item.source === source)
  return renderFormulaExample({
    source,
    label: match?.label || '',
  })
}).join('\n')

export default {
  path: '/latex-whiteboard/',
  title: 'LaTeX Whiteboard — Draw and Add Math Formulas | MathBoard',
  description:
    'Draw on a browser whiteboard and insert rendered LaTeX formulas with live preview. MathBoard uses KaTeX and is free and open source.',
  h1: 'Draw first. Drop in LaTeX when you need it.',
  ogImage: '/og-image.png',
  structuredData: 'software-application',
  needsKatex: true,
  body: `
    <p class="lede">
      Use the Formula tool to type LaTeX, preview the result, and place the rendered formula on the board. Existing formulas can be selected and edited again.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'latex-whiteboard-hero' })}</p>
    <section>
      <h2>How to add a formula</h2>
      <ol>
        <li>Select Formula (or press <kbd>F</kbd>).</li>
        <li>Type LaTeX and check the preview.</li>
        <li>Insert it on the canvas; select it later to edit it again.</li>
      </ol>
    </section>
    <section>
      <h2>Example formulas</h2>
      <p>These are rendered at build time with the same KaTeX library MathBoard uses in the app.</p>
      <div class="formula-grid">
        ${featured}
      </div>
      <p>More examples: <a href="/docs/latex/">LaTeX formula examples</a>.</p>
    </section>
    <section>
      <h2>Related</h2>
      <ul>
        <li><a href="/math-whiteboard/">Online math whiteboard overview</a></li>
        <li><a href="/">Open MathBoard</a></li>
      </ul>
    </section>
  `,
}
