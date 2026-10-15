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

import { renderOpenBoardCTA } from '../lib/render-components.mjs'

export default {
  path: '/open-source-math-whiteboard/',
  title: 'Open-Source Math Whiteboard — MathBoard',
  description:
    'MathBoard is a free, browser-based math whiteboard released under the GNU AGPL v3. View the source, report issues, or contribute on GitHub.',
  h1: 'An open-source whiteboard for math',
  structuredData: 'webpage',
  aboutSoftware: true,
  body: `
    <p class="lede">
      MathBoard is released under the <strong>GNU Affero General Public License v3</strong>.
      You can run it locally, inspect the code, and contribute.
    </p>
    <p class="cta-row">
      ${renderOpenBoardCTA({ placement: 'open-source-hero' })}
      <a class="button" href="https://github.com/giacomobartoloni/mathboard">View source on GitHub</a>
    </p>
    <section>
      <h2>Repository</h2>
      <ul>
        <li><a href="https://github.com/giacomobartoloni/mathboard">Source on GitHub</a></li>
        <li><a href="https://github.com/giacomobartoloni/mathboard/issues">Issues</a></li>
        <li><a href="/resources/">All MathBoard resources</a></li>
      </ul>
    </section>
    <section>
      <h2>Stack</h2>
      <ul>
        <li>Vue 3</li>
        <li>Fabric.js (canvas)</li>
        <li>KaTeX (formulas)</li>
        <li>Vite (build)</li>
      </ul>
    </section>
    <section>
      <h2>Run locally</h2>
      <pre><code>npm ci
npm run dev</code></pre>
      <p>Production build:</p>
      <pre><code>npm run build
npm run preview</code></pre>
    </section>
  `,
}
