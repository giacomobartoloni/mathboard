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
import { ActiveSelection, Rect, Group, Circle, Path, Textbox } from 'fabric';
import { ensureMathBoardObjectId, getMathBoardObjectId } from '../src/board/ids.js';
import { FormulaObject } from '../src/formulas/FormulaObject.js';
import { installFabricDomStub } from './helpers/fabric-dom-stub.js';
import { makeControllerCanvas } from './helpers/controller-canvas.js';
import { BoardHistory } from '../src/history/BoardHistory.js';
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js';
import { SelectionMutations } from '../src/board/interactions/SelectionMutations.js';
import { BoardLifecycle } from '../src/board/BoardLifecycle.js';

installFabricDomStub();

function setup(reject = false, onCommittedOperation = () => {}, lifecycle = null) {
  const canvas = makeControllerCanvas();
  canvas.add = (...objects) => objects.forEach((object) => canvas.insertAt(canvas.getObjects().length, object));
  canvas.fire = () => {};
  canvas.getRetinaScaling = () => 1;
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
    onCommittedOperation,
    lifecycle,
  });
  return { canvas, history, mutations };
}

for (const action of ['group', 'ungroup', 'delete']) {
  test(action + ' reports one effect and succeeds when rendering fails after history commit', () => {
    const effects = [];
    const { canvas, history, mutations } = setup(false, (effect) => effects.push(effect));
    const a = rect(0), b = rect(90);
    if (action === 'ungroup') {
      const group = new Group([a, b]);
      canvas.add(group);
      canvas.setActiveObject(group);
    } else {
      canvas.add(a, b);
      canvas.setActiveObject(new ActiveSelection([a, b], { canvas }));
    }
    const original = console.error;
    const logged = [];
    console.error = (message) => logged.push(message);
    canvas.requestRenderAll = () => { throw new Error('paint unavailable'); };
    try {
      const result = mutations[action]();
      assert.equal(action === 'delete' ? result.length : result, action === 'delete' ? 2 : true);
    } finally {
      console.error = original;
    }
    assert.equal(history.summary().length, 1);
    assert.deepEqual(effects, action === 'delete'
      ? [{ kind: 'delete', objectKinds: ['shape', 'shape'] }]
      : [{ kind: action }]);
    assert.deepEqual(logged, ['Board selection refresh failed after commit.']);
  });
}

test('deletion remains committed if analytics kind classification fails', () => {
  const effects = [];
  const { canvas, history, mutations } = setup(false, (effect) => effects.push(effect));
  const object = rect(0);
  canvas.add(object);
  canvas.setActiveObject(object);
  mutations._policy.kindOf = () => { throw new Error('analytics classification unavailable'); };
  assert.deepEqual(mutations.delete(), [object]);
  assert.equal(canvas.getObjects().length, 0);
  assert.equal(history.summary().tipType, 'delete');
  assert.deepEqual(effects, [{ kind: 'delete', objectKinds: ['unknown'] }]);
});
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

test('duplicate gives a nested group fresh IDs and keeps retained sources', async () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0), b = rect(80);
  const original = new Group([a, b]);
  ensureMathBoardObjectId(original);
  ensureMathBoardObjectId(a);
  ensureMathBoardObjectId(b);
  canvas.add(original);
  canvas.setActiveObject(original);
  assert.equal(await mutations.duplicate(), true);
  const [source, clone] = roots(canvas);
  assert.equal(source, original);
  assert.notEqual(getMathBoardObjectId(source), getMathBoardObjectId(clone));
  const originalIds = source.getObjects().map(getMathBoardObjectId);
  const clonedIds = clone.getObjects().map(getMathBoardObjectId);
  clonedIds.forEach((id) => assert.ok(!originalIds.includes(id)));
  assert.equal(history.summary().tipType, 'duplicate');
  history.undo();
  assert.deepEqual(roots(canvas), [original]);
  history.redo();
  assert.deepEqual(roots(canvas), [original, clone]);
});

test('duplicate retains Formula semantic metadata', async () => {
  const { canvas, mutations } = setup();
  const formula = new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x+1', mathboardInkMode: 'fixed', fill: '#123456' });
  canvas.add(formula);
  canvas.setActiveObject(formula);
  assert.equal(await mutations.duplicate(), true);
  const clone = roots(canvas)[1];
  assert.equal(clone.latex, formula.latex);
  assert.equal(clone.formulaType, formula.formulaType);
  assert.notEqual(getMathBoardObjectId(clone), getMathBoardObjectId(formula));
});

test('clone rejection does not change roots or history', async () => {
  const { canvas, history, mutations } = setup();
  const a = rect(0);
  a.clone = async () => { throw new Error('cannot clone'); };
  canvas.add(a);
  canvas.setActiveObject(a);
  assert.equal(await mutations.duplicate(), false);
  assert.deepEqual(roots(canvas), [a]);
  assert.equal(history.summary().length, 0);
});

test('duplicate cannot add a delayed clone after the board epoch changes', async () => {
  const lifecycle = new BoardLifecycle();
  const { canvas, history, mutations } = setup(false, () => {}, lifecycle);
  const source = rect(0);
  const originalClone = source.clone.bind(source);
  let finishClone;
  source.clone = () => new Promise(resolve => { finishClone = () => resolve(originalClone()); });
  canvas.add(source);
  canvas.setActiveObject(source);

  const pending = mutations.duplicate();
  await lifecycle.transition(async () => {});
  finishClone();

  assert.equal(await pending, false);
  assert.deepEqual(roots(canvas), [source]);
  assert.equal(history.summary().length, 0);
});

test('history rejection during duplicate restores selection and objects', async () => {
  const { canvas, history, mutations } = setup(true);
  const a = rect(0);
  canvas.add(a);
  canvas.setActiveObject(a);
  await assert.rejects(() => mutations.duplicate(), /notification rejected/);
  assert.deepEqual(roots(canvas), [a]);
  assert.equal(canvas.getActiveObject(), a);
  assert.equal(history.summary().length, 0);
});

test('coalesced selection recolors notify each time but produce one undo step', () => {
  const { canvas, history, mutations } = setup();
  const rectA = rect(0);
  rectA.set({ stroke: '#010101', mathboardInkMode: 'fixed' });
  canvas.add(rectA);
  canvas.setActiveObject(rectA);
  let notifications = 0;
  history._onDocumentChanged = () => { notifications++; };
  assert.equal(mutations.recolor('#aa0000', { coalesce: true }), true);
  assert.equal(mutations.recolor('#bb0000', { coalesce: true }), true);
  assert.equal(notifications, 2);
  assert.equal(history.summary().length, 1);
  assert.equal(rectA.stroke, '#bb0000');
  history.undo();
  assert.equal(rectA.stroke, '#010101');
  history.redo();
  assert.equal(rectA.stroke, '#bb0000');
  assert.equal(mutations.recolor(null), true);
  assert.equal(rectA.mathboardInkMode, 'auto');
  assert.equal(rectA.stroke, '#111111');
});

test('wrapped text recolors with an undoable selection command', () => {
  const { canvas, history, mutations } = setup();
  const text = new Textbox('Wrapped text', { width: 120, fill: '#010101' });
  canvas.add(text);
  canvas.setActiveObject(text);
  assert.equal(mutations.recolor('#aa0000'), true);
  assert.equal(text.fill, '#aa0000');
  assert.equal(history.summary().length, 1);
  history.undo();
  assert.equal(text.fill, '#010101');
});

test('coalesced notification failure restores original entry and paint', () => {
  const { canvas, history, mutations } = setup();
  const a = new Circle({ left: 20, top: 30, radius: 12, fill: 'transparent', stroke: '#101010' });
  a.mathboardInkMode = 'fixed';
  canvas.add(a);
  canvas.setActiveObject(a);
  assert.equal(mutations.recolor('#220000', { coalesce: true }), true);
  const before = history._entries[0].entries[0].before;
  const summary = history.summary();
  history._onDocumentChanged = () => { throw new Error('notification rejected'); };
  assert.throws(() => mutations.recolor('#330000', { coalesce: true }), /notification rejected/);
  assert.equal(a.stroke, '#220000');
  assert.equal(a.fill, 'transparent');
  assert.deepEqual(history._entries[0].entries[0].before, before);
  assert.deepEqual(history.summary(), summary);
  history._onDocumentChanged = () => {};
  history.undo();
  assert.equal(a.stroke, '#101010');
});
