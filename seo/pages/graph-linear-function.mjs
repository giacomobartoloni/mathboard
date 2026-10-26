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

import { renderKatex } from '../lib/katex-render.mjs'
import { renderOpenBoardCTA, renderScreenshot } from '../lib/render-components.mjs'

export default {
  lastmod: '2026-10-26',
  path: '/examples/graph-linear-function/',
  title: 'How to Graph a Linear Function Step by Step | MathBoard',
  description:
    'Learn to graph y = 2x + 1 by hand: find the intercept, use rise over run, check points, and recreate the lesson on a free math whiteboard.',
  h1: 'How to graph a linear function by hand',
  structuredData: 'docs',
  aboutSoftware: true,
  needsKatex: true,
  breadcrumbs: [
    { label: 'MathBoard', href: '/' },
    { label: 'Resources', href: '/resources/' },
    { label: 'Graph a linear function' },
  ],
  body: `
    <div class="reading-intro">
  <p class="lede">
    A straight-line graph does not require a graphing calculator. Start with the y-intercept,
    use the slope to place a second point, then draw the line. This lesson works for learners
    meeting linear functions in secondary mathematics and for tutors explaining them online.
  </p>
  <p class="cta-row">${renderOpenBoardCTA({ placement: 'linear-function-intro' })}</p>
</div>
<section>
  <h2>What does y = 2x + 1 tell us?</h2>
  <p>
    A linear function in slope-intercept form is written as <strong>y = mx + b</strong>.
    The number <strong>b</strong> tells you where the graph crosses the vertical (y) axis;
    <strong>m</strong> is the slope, or change in y for each one-unit increase in x.
    For our example, <strong>b = 1</strong> and <strong>m = 2</strong>.
  </p>
  <div class="formula-render" aria-label="y equals 2 x plus 1">${renderKatex('y = 2x + 1')}</div>
  <p>
    Put a point at <strong>(0, 1)</strong>. A slope of <strong>2 = 2/1</strong> means
    move one unit to the right and two units up, landing at <strong>(1, 3)</strong>.
    Repeat to reach <strong>(2, 5)</strong>. Connect the points with a straight line
    and extend it in both directions.
  </p>
  ${renderScreenshot({ src: '/seo/examples/linear-function.svg', width: 860, height: 540, alt: 'Coordinate graph of y = 2x + 1 through (0, 1), (1, 3), and (2, 5), with rise two and run one annotated.', caption: 'An original teaching diagram with a consistent unit scale. Recreate it manually on MathBoard using the steps below.' })}
</section>
<section>
  <h2>Check the points before drawing</h2>
  <p>
    You can calculate a few coordinates by substituting x into y = 2x + 1.
    The points must line up because the change in y stays equal to twice the change in x.
  </p>
  <div class="table-wrap">
    <table>
      <thead><tr><th scope="col">x</th><th scope="col">Calculation</th><th scope="col">y</th><th scope="col">Point</th></tr></thead>
      <tbody>
        <tr><td>−1</td><td>2(−1) + 1</td><td>−1</td><td>(−1, −1)</td></tr>
        <tr><td>0</td><td>2(0) + 1</td><td>1</td><td>(0, 1)</td></tr>
        <tr><td>1</td><td>2(1) + 1</td><td>3</td><td>(1, 3)</td></tr>
        <tr><td>2</td><td>2(2) + 1</td><td>5</td><td>(2, 5)</td></tr>
      </tbody>
    </table>
  </div>
  <p>
    The table is a check, not a prerequisite: once you understand the intercept
    and slope, two distinct points determine the line.
  </p>
</section>
<section>
  <h2>Recreate the example on MathBoard</h2>
  <ol>
    <li><strong>Open the board.</strong> Choose <em>Stamps</em> and insert the <em>Cartesian plane</em> kit.
      It supplies the axes and labels, not a numbered grid or a plotted function.</li>
    <li><strong>Set a scale.</strong> Use the Pen or Line tool to mark evenly spaced unit ticks on both axes.
      Label the units with Text. The same physical distance must represent one unit on each axis for the slope triangle to look proportional.</li>
    <li><strong>Mark the intercept.</strong> Use the Pen or Circle tool to mark (0, 1).
      From there, count one tick to the right and two ticks upward to mark (1, 3);
      repeat for (2, 5).</li>
    <li><strong>Draw the line.</strong> Use the Line tool to connect the points and extend the straight line.
      You are drawing it manually; MathBoard does not automatically plot an equation.</li>
    <li><strong>Add an editable equation.</strong> Choose <em>Formula</em> (shortcut <kbd>F</kbd>),
      enter <code>y = 2x + 1</code>, check the preview and insert it beside your graph.
      Select the formula later to edit it again.</li>
    <li><strong>Explain the movement.</strong> With the Pen or Line tool, draw a horizontal run of 1
      and a vertical rise of 2 between (0, 1) and (1, 3); annotate them with Text.</li>
  </ol>
  <p>
    For help with notation, see the <a href="/latex-whiteboard/">LaTeX whiteboard guide</a>.
    The same workflow works during a video call using your normal screen-sharing software.
    MathBoard is a drawing surface, not a built-in live graphing calculator.
  </p>
</section>
<section>
  <h2>Try another line: y = −x + 2</h2>
  <p>
    Ask the learner to find the new y-intercept, plot a second point and explain
    why the line slopes downward. Use exactly the same axes and one-unit spacing.
    Let them predict where it crosses the x-axis before showing the answer.
  </p>
  <details>
    <summary>Check the worked answer</summary>
    <p>
      The intercept is <strong>(0, 2)</strong>. The slope is <strong>−1</strong>:
      move one unit right and one unit down to get <strong>(1, 1)</strong>.
      Another step gives <strong>(2, 0)</strong>, so the x-intercept is 2.
      The slope is negative because y decreases as x increases.
    </p>
  </details>
</section>
<section>
  <h2>Two mistakes worth discussing</h2>
  <ul>
    <li><strong>Starting at x = 1 instead of y = 1.</strong> In y = mx + b, b is
      the y-value when x = 0, so the first point lies on the vertical axis.</li>
    <li><strong>Treating slope 2 as “move right two”.</strong> Think of 2 as 2/1:
      move up two units for each one unit to the right. Equal spacing makes that
      visible on the drawing.</li>
  </ul>
  <p>
    For additional background on coordinates, see
    <a href="https://openstax.org/books/elementary-algebra-2e/pages/4-1-use-the-rectangular-coordinate-system">OpenStax's coordinate-system chapter</a>.
    This worked example and diagram were written for MathBoard rather than copied from that resource.
  </p>
</section>
<section>
  <h2>Explain it on your own board</h2>
  <p>
    Build a line, annotate the slope and invite the student to predict the next point.
    MathBoard is free, open source and works in the browser without an account.
  </p>
  <p class="cta-row">${renderOpenBoardCTA({ placement: 'linear-function-bottom' })} <a class="button" href="/math-whiteboard/">About the math whiteboard</a></p>
</section>
  `,
}
