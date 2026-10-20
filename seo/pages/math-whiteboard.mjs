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

import {
  renderOpenBoardCTA,
  renderScreenshot,
} from '../lib/render-components.mjs'

export default {
  path: '/math-whiteboard/',
  title: 'MathBoard — Free Online Whiteboard for Math',
  description:
    'A browser-based whiteboard for math: draw freehand, write text, add LaTeX formulas, use shapes, and switch between light, dark, and chalkboard themes.',
  h1: 'A whiteboard built for math',
  ogImage: '/og-image.png',
  structuredData: 'software-application',
  body: `
    <p class="lede">
      MathBoard combines freehand drawing, text, shapes, and LaTeX formulas on one canvas. It runs in the browser and is free and open source.
    </p>
    <p class="cta-row">${renderOpenBoardCTA({ placement: 'math-whiteboard-hero' })}</p>
    ${renderScreenshot({
      src: '/og-image.png',
      alt: 'MathBoard canvas with handwritten notes and a rendered math formula',
      eager: true,
      caption: 'MathBoard in the browser — draw, type, and place formulas on one board.',
    })}
    <section>
      <h2>What you can do</h2>
      <ul>
        <li>Draw freehand with the pen tool</li>
        <li>Add and edit text</li>
        <li>Insert LaTeX formulas with a live preview (KaTeX)</li>
        <li>Draw rectangles, circles, and lines</li>
        <li>Select, pan, zoom, undo, and redo</li>
        <li>Switch board themes: light, dark, and chalkboard</li>
      </ul>
    </section>
    <section>
      <h2>Why a math-specific whiteboard?</h2>
      <p>
        You can sketch a diagram and drop in a rendered formula without leaving the canvas.
        Formulas stay editable: select one and open it again in the Formula tool.
        Themes include a chalkboard surface when you want that look for teaching or notes.
        Nothing to install — open the board in a browser.
      </p>
    </section>
    <section>
      <h2>Related</h2>
      <ul>
        <li><a href="/latex-whiteboard/">LaTeX whiteboard</a> — formula workflow and examples</li>
        <li><a href="/docs/keyboard-shortcuts/">Keyboard shortcuts</a></li>
        <li><a href="/open-source-math-whiteboard/">Open-source details</a></li>
        <li><a href="https://github.com/giacomobartoloni/mathboard">GitHub repository</a></li>
      </ul>
    </section>
  `,
}
