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
import { ActiveSelection, Rect, Group } from 'fabric';
import { installFabricDomStub } from './helpers/fabric-dom-stub.js';
import { makeControllerCanvas } from './helpers/controller-canvas.js';
import { BoardHistory } from '../src/history/BoardHistory.js';
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js';
import { SelectionMutations } from '../src/board/interactions/SelectionMutations.js';

installFabricDomStub();

function setup(reject = false) {
  const canvas = makeControllerCanvas();
  canvas.add = (...objects) => objects.forEach((object) => canvas.insertAt(canvas.getObjects().length, object));
  const history = new BoardHistory({
    getCanvas: () => canvas,
    syncAutoInk: () => {},
    onDocumentChanged: () => { if (reject) throw new Error('notification rejected'); },
  });
  const mutations = new SelectionMutations({
    getCanvas: () => canvas,
    history,
    boardObjectPolicy: new BoardObjectPolicy(),
    getDefaultInk: () => '#111111',
  });
  return { canvas, history, mutations };
}
function rect(left) { return new Rect({ left, top: 40, width: 30, height: 20 }); }
function roots(canvas) { return canvas.getObjects().slice(); }

test('UI grouping accepts an existing Board Group with a loose root, then replays once', () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0), b = rect(80), loose = rect(180);
  const nested = new Group([a, b]);
  canvas.add(nested, loose);
  canvas.setActiveObject(new ActiveSelection([nested, loose], { canvas }));
  assert.equal(mutations.group(), true);
  const outer = roots(canvas)[0];
  assert.deepEqual(outer.getObjects(), [nested, loose]);
  assert.equal(history.summary().tipType, 'group');
  assert.equal(history.summary().length, 1);
  history.undo();
  assert.deepEqual(roots(canvas), [nested, loose]);
  history.redo();
  assert.deepEqual(roots(canvas), [outer]);
});

test('ungroup keeps Formula-like Group atomic and does not discard redo', () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0);
  canvas.add(a);
  history.record({ type: 'add', object: a, index: 0 });
  history.undo();
  const before = history.summary();
  const formula = new Group([rect(10)]);
  formula.objectKind = 'formula';
  formula.latex = 'x';
  canvas.add(formula);
  canvas.setActiveObject(formula);
  assert.equal(mutations.ungroup(), false);
  assert.deepEqual(history.summary(), before);
});

test('delete multiple selected roots is one retained command and undo restores order', () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0), b = rect(80), c = rect(160);
  canvas.add(a, b, c);
  canvas.setActiveObject(new ActiveSelection([a, c], { canvas }));
  assert.deepEqual(mutations.delete(), [a, c]);
  assert.deepEqual(roots(canvas), [b]);
  assert.equal(history.summary().tipType, 'delete');
  history.undo();
  assert.deepEqual(roots(canvas), [a, b, c]);
});

for (const action of ['group', 'ungroup', 'delete']) {
  test(action + ' restores canvas and history when document notification fails', () => {
    const { canvas, history, mutations } = setup(true);
    const a = rect(0), b = rect(90);
    if (action === 'ungroup') {
      const group = new Group([a, b]);
      canvas.add(group);
      canvas.setActiveObject(group);
    } else {
      canvas.add(a, b);
      canvas.setActiveObject(new ActiveSelection([a, b], { canvas }));
    }
    const before = roots(canvas);
    const active = canvas.getActiveObject();
    const summary = history.summary();
    assert.throws(() => mutations[action](), /notification rejected/);
    assert.deepEqual(roots(canvas), before);
    assert.equal(canvas.getActiveObject(), active);
    assert.deepEqual(history.summary(), summary);
    if (action === 'ungroup') assert.deepEqual(active.getObjects(), [a, b]);
  });
}

test('empty/no-op selection actions leave redo intact', () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0);
  canvas.add(a);
  history.record({ type: 'add', object: a, index: 0 });
  history.undo();
  const before = history.summary();
  assert.deepEqual(mutations.delete(), []);
  assert.equal(mutations.group(), false);
  assert.equal(mutations.ungroup(), false);
  assert.deepEqual(history.summary(), before);
});
