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

import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import {
  CURSOR,
  SELECTION,
  QUICK_INSERT_ITEMS,
  LATEX_PALETTE_GROUPS,
} from '../src/config/latexPalette.js';

test('math helpers insert editable wrappers with cursor and selection support', () => {
  const cases = {
    boldsymbol: '\\boldsymbol{',
    mathbf: '\\mathbf{',
    bmatrix: '\\begin{bmatrix}',
  };
  for (const [id, prefix] of Object.entries(cases)) {
    const item = QUICK_INSERT_ITEMS.find((candidate) => candidate.id === id);
    assert.ok(item, id);
    assert.ok(item.preview.startsWith(prefix), id);
    assert.ok(item.template.startsWith(prefix), id);
    assert.ok(item.template.includes(CURSOR), id);
    assert.ok(item.selectionTemplate.includes(SELECTION), id);
    assert.ok(item.selectionTemplate.includes(CURSOR), id);
  }
  assert.equal(new Set(QUICK_INSERT_ITEMS.map((item) => item.id)).size, QUICK_INSERT_ITEMS.length);
});


test('formula toolbar entries have unique identifiers and insertion templates', () => {
  const groups = [
    { id: 'quick-insert', items: QUICK_INSERT_ITEMS },
    ...LATEX_PALETTE_GROUPS,
  ];
  const seen = new Set();

  for (const group of groups) {
    assert.ok(group.items.length > 0, group.id);
    for (const item of group.items) {
      const context = group.id + '/' + item.id;
      assert.ok(!seen.has(item.id), 'Duplicate identifier: ' + context);
      seen.add(item.id);
      assert.ok(item.ariaLabel, context);
      assert.ok(item.preview, context);
      assert.ok(item.template, context);
      assert.ok(!item.preview.includes(CURSOR), context);
      assert.ok(!item.preview.includes(SELECTION), context);
    }
  }
});

test('KaTeX accepts every Quick Insert and symbol palette preview', () => {
  const groups = [
    { id: 'quick-insert', items: QUICK_INSERT_ITEMS },
    ...LATEX_PALETTE_GROUPS,
  ];

  for (const group of groups) {
    for (const item of group.items) {
      const context = group.id + '/' + item.id;
      let markup;
      try {
        markup = katex.renderToString(item.preview, {
          displayMode: true,
          throwOnError: true,
          strict: false,
        });
      } catch (error) {
        assert.fail(context + ': ' + error.message);
      }
      assert.match(markup, /class="katex"/, context);
      assert.doesNotMatch(markup, /katex-error/, context);
    }
  }
});
