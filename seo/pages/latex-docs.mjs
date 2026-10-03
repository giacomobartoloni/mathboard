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

import { LATEX_EXAMPLES } from '../data/latex-examples.mjs'
import { escapeHtml } from '../lib/escape-html.mjs'
import { renderFormulaExample } from '../lib/katex-render.mjs'
import { renderOpenBoardCTA } from '../lib/render-components.mjs'

function groupByCategory(examples) {
  const groups = new Map()
  for (const example of examples) {
    if (!groups.has(example.category)) {
      groups.set(example.category, [])
    }
    groups.get(example.category).push(example)
  }
  return groups
}

function renderSections() {
  const groups = groupByCategory(LATEX_EXAMPLES)
  let html = ''
  for (const [category, items] of groups) {
    html += `
      <section>
        <h2>${escapeHtml(category)}</h2>
        <div class="formula-grid">
          ${items.map((item) => renderFormulaExample(item)).join('\n')}
        </div>
      </section>
    `
  }
  return html
}

export default {
  path: '/docs/latex/',
  title: 'LaTeX in MathBoard — Formula Examples',
  description:
    'Quick LaTeX examples for MathBoard formulas: fractions, roots, powers, integrals, sums, Greek letters, and common math notation.',
  h1: 'LaTeX formula examples',
  structuredData: 'docs',
  needsKatex: true,
  breadcrumbs: [
    { label: 'Resources', href: '/resources/' },
    { label: 'LaTeX formula examples' },
  ],
  body: `
    <p class="lede">
      Short examples for the Formula tool. MathBoard renders LaTeX with KaTeX; these samples are compiled during the site build.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'latex-docs-hero' })}</p>
    ${renderSections()}
    <p>
      Workflow: <a href="/latex-whiteboard/">LaTeX whiteboard</a> ·
      <a href="/">Open MathBoard</a>
    </p>
  `,
}
