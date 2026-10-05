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

import { SHORTCUT_HELP } from '../../src/config/shortcuts.js'
import { escapeHtml } from '../lib/escape-html.mjs'
import { renderOpenBoardCTA } from '../lib/render-components.mjs'

function renderShortcutTables() {
  return SHORTCUT_HELP.map((section) => {
    const rows = section.items
      .map(
        (item) => `
      <tr>
        <td><kbd>${escapeHtml(item.keys)}</kbd></td>
        <td>${escapeHtml(item.label)}${item.hint ? `<br><span class="muted">${escapeHtml(item.hint)}</span>` : ''}</td>
      </tr>`,
      )
      .join('')
    return `
      <section>
        <h2>${escapeHtml(section.group)}</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Shortcut</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </section>
    `.trim()
  }).join('\n')
}

export default {
  path: '/docs/keyboard-shortcuts/',
  title: 'MathBoard Keyboard Shortcuts',
  description:
    'Keyboard shortcuts for MathBoard tools, undo and redo, deleting selections, and cancelling actions.',
  h1: 'Keyboard shortcuts',
  structuredData: 'docs',
  breadcrumbs: [
    { label: 'Resources', href: '/resources/' },
    { label: 'Keyboard shortcuts' },
  ],
  body: `
    <p class="lede">
      Shortcuts shipped in MathBoard. The same list appears in the About panel inside the board.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'shortcuts-hero' })}</p>
    ${renderShortcutTables()}
    <p><a href="/resources/">Back to resources</a> · <a href="/">Open MathBoard</a></p>
  `,
}
