/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeCanvasEvents } from '../src/board/canvasEventSubscriptions.js';

function emitter() {
  const listeners = new Map();
  const removed = [];
  return {
    removed,
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    off(event, listener) {
      assert.equal(typeof listener, 'function', 'broad event removal is not permitted');
      removed.push([event, listener]);
      listeners.get(event)?.delete(listener);
    },
    fire(event, payload) {
      for (const listener of [...(listeners.get(event) || [])]) listener(payload);
    },
    count(event) { return listeners.get(event)?.size || 0; },
  };
}

test('teardown removes only callbacks owned by one DrawBoard subscriber', () => {
  const canvas = emitter();
  const trace = [];
  const external = () => trace.push('external');
  const relay = () => trace.push('relay');
  const behavior = () => trace.push('behavior');
  canvas.on('object:modified', external);
  const disposeRelay = subscribeCanvasEvents(canvas, [['object:modified', relay]]);
  const disposeBehavior = subscribeCanvasEvents(canvas, [['object:modified', behavior]]);
  canvas.fire('object:modified');
  assert.deepEqual(trace, ['external', 'relay', 'behavior']);
  disposeRelay();
  canvas.fire('object:modified');
  assert.deepEqual(trace.slice(3), ['external', 'behavior']);
  assert.equal(canvas.count('object:modified'), 2);
  disposeBehavior();
  disposeRelay();
  assert.equal(canvas.count('object:modified'), 1);
  canvas.fire('object:modified');
  assert.equal(trace.at(-1), 'external');
  assert.equal(canvas.removed.length, 2);
});

test('repeated mount/dispose cycles do not retain listeners or duplicate callbacks', () => {
  const canvas = emitter();
  let calls = 0;
  for (let i = 0; i < 5; i++) {
    const dispose = subscribeCanvasEvents(canvas, [
      ['mouse:dblclick', () => { calls++; }],
      ['mouse:down', () => { calls++; }],
    ]);
    assert.equal(canvas.count('mouse:dblclick'), 1);
    canvas.fire('mouse:dblclick');
    dispose();
    dispose();
    assert.equal(canvas.count('mouse:dblclick'), 0);
    assert.equal(canvas.count('mouse:down'), 0);
  }
  assert.equal(calls, 5);
});

test('partial registration failure rolls back owned listeners only', () => {
  const canvas = emitter();
  const external = () => {};
  canvas.on('mouse:down', external);
  const on = canvas.on.bind(canvas);
  canvas.on = (event, listener) => {
    if (event === 'mouse:up') throw new Error('subscription failed');
    on(event, listener);
  };
  assert.throws(() => subscribeCanvasEvents(canvas, [
    ['mouse:down', () => {}],
    ['mouse:up', () => {}],
  ]), /subscription failed/);
  assert.equal(canvas.count('mouse:down'), 1);
  assert.equal(canvas.removed.length, 1);
});
