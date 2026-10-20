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

import { renderOpenBoardCTA, renderResourceCard } from '../lib/render-components.mjs'

export default {
  path: '/resources/',
  title: 'MathBoard Resources — Guides, LaTeX and Shortcuts',
  description:
    'Practical MathBoard resources: LaTeX examples, keyboard shortcuts, product guides, and the open-source repository.',
  h1: 'MathBoard resources',
  structuredData: 'webpage',
  body: `
    <p class="lede">
      Short references and guides for using MathBoard. No account or setup guide is required to start drawing — open the board whenever you want.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'resources-hero' })}</p>
    <div class="resource-grid">
      ${renderResourceCard({
        href: '/math-whiteboard/',
        title: 'Math whiteboard overview',
        description: 'What MathBoard is: freehand, text, shapes, LaTeX, and board themes in the browser.',
      })}
      ${renderResourceCard({
        href: '/latex-whiteboard/',
        title: 'LaTeX whiteboard',
        description: 'How the Formula tool works, with live KaTeX examples you can copy.',
      })}
      ${renderResourceCard({
        href: '/docs/latex/',
        title: 'LaTeX formula examples',
        description: 'A short reference of fractions, roots, integrals, Greek letters, and more.',
      })}
      ${renderResourceCard({
        href: '/docs/keyboard-shortcuts/',
        title: 'Keyboard shortcuts',
        description: 'Tool keys, undo/redo, selection, zoom, and other shipped shortcuts.',
      })}
      ${renderResourceCard({
        href: '/open-source-math-whiteboard/',
        title: 'Open-source math whiteboard',
        description: 'AGPL v3 license, repository links, and how to run MathBoard locally.',
      })}
      ${renderResourceCard({
        href: 'https://github.com/giacomobartoloni/mathboard',
        title: 'GitHub repository',
        description: 'Source code, issues, and contributions.',
      })}
    </div>
  `,
}
