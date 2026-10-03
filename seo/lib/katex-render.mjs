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

import katex from 'katex'
import { escapeHtml } from './escape-html.mjs'

export function renderKatex(source, { displayMode = true } = {}) {
  return katex.renderToString(source, {
    displayMode,
    throwOnError: true,
    strict: false,
  })
}

export function renderFormulaExample({ source, label = '' }) {
  const rendered = renderKatex(source)
  const labelHtml = label
    ? `<p class="formula-label">${escapeHtml(label)}</p>`
    : ''
  return `
    <div class="formula-example">
      ${labelHtml}
      <pre><code>${escapeHtml(source)}</code></pre>
      <div class="formula-render" aria-hidden="true">${rendered}</div>
      <button type="button" class="copy-latex" data-copy-latex="${escapeHtml(source)}">Copy LaTeX</button>
    </div>
  `.trim()
}
