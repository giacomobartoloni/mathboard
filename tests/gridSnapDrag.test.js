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
import { ActiveSelection, Point, Rect } from 'fabric';
import { installFabricDomStub } from './helpers/fabric-dom-stub.js';
import { GridSnapDrag } from '../src/board/interactions/GridSnapDrag.js';

installFabricDomStub();

function fixture(bounds = { left: 71, top: 51 }) {
  let enabled = true;
  const target = {
    bounds: { ...bounds },
    coordCalls: 0,
    getBoundingRect() { return { ...this.bounds }; },
    getXY() { return { x: this.bounds.left, y: this.bounds.top }; },
    setXY(point) { this.bounds.left = point.x; this.bounds.top = point.y; },
    setCoords() { this.coordCalls++; },
  };
  const gesture = new GridSnapDrag({
    canvas: { getZoom: () => 1 },
    isEnabled: () => enabled,
  });
  return { target, gesture, disable: () => { enabled = false; } };
}

test('drag moves one whole target to an invisible subgrid anchor without a click jump', () => {
  const { target, gesture } = fixture();
  gesture.begin({ action: 'drag', target });
  assert.equal(gesture.move({ target }), false);
  assert.deepEqual(target.bounds, { left: 71, top: 51 });
  target.setXY({ x: 78.5, y: 58.7 });
  assert.equal(gesture.move({ target }), true);
  assert.ok(Math.abs(target.bounds.left - 80) < 1e-8);
  assert.ok(Math.abs(target.bounds.top - 60) < 1e-8);
  // One no-op frame refresh, then refresh before and after magnetic movement.
  assert.equal(target.coordCalls, 3);
  assert.equal(gesture.session.latchX, 80);
  gesture.clear();
  assert.equal(gesture.move({ target }), false);
});

test('only translation gestures are eligible and Alt bypasses without residue', () => {
  const { target, gesture, disable } = fixture();
  for (const action of ['scale', 'rotate', 'resizing']) {
    gesture.begin({ action, target });
    target.setXY({ x: 78, y: 59 });
    assert.equal(gesture.move({ target }), false);
  }
  gesture.begin({ action: 'drag', target });
  target.setXY({ x: 88, y: 69 });
  assert.equal(gesture.move({ target, e: { altKey: true } }), false);
  assert.equal(gesture.session.latchX, null);
  assert.equal(gesture.move({ target, e: { altKey: false } }), true);
  assert.equal(target.bounds.left, 90);
  disable();
  assert.equal(gesture.move({ target }), false);
});

test('a raw pointer update never accumulates the preceding snapped offset', () => {
  const { target, gesture } = fixture({ left: 71, top: 51 });
  gesture.begin({ action: 'drag', target });
  for (let frame = 0; frame < 5; frame++) {
    // Fabric derives each new raw position from pointer+original drag offset.
    target.setXY({ x: 78, y: 59 });
    assert.equal(gesture.move({ target }), true);
    assert.deepEqual(target.bounds, { left: 80, top: 60 });
  }
  target.setXY({ x: 73, y: 64 });
  assert.equal(gesture.move({ target }), false);
  assert.deepEqual(target.bounds, { left: 73, top: 64 });
});

test('Fabric setXY applies a real Point with nonzero offsets and snap bounds', () => {
  const rect = new Rect({
    left: 71, top: 51, width: 20, height: 20,
    strokeWidth: 0, originX: 'left', originY: 'top',
  });
  const gesture = new GridSnapDrag({
    canvas: { getZoom: () => 1 },
    isEnabled: () => true,
  });
  const before = rect.getBoundingRect();
  gesture.begin({ action: 'drag', target: rect });
  rect.setXY(new Point(rect.getXY().x + 7.2, rect.getXY().y + 7.2));
  // The real Fabric drag event has not refreshed aCoords before object:moving.
  assert.equal(gesture.move({ target: rect }), true);
  const after = rect.getBoundingRect();
  assert.ok(Math.abs(after.left - 80) < 1e-6, JSON.stringify({ before, after }));
  assert.ok(Math.abs(after.top - 60) < 1e-6, JSON.stringify({ before, after }));
  assert.equal(rect.width, 20);
  assert.equal(rect.height, 20);
});

test('Fabric ActiveSelection translates as one target without changing member spacing', () => {
  const a = new Rect({ left: 71, top: 51, width: 20, height: 20, strokeWidth: 0 });
  const b = new Rect({ left: 121, top: 71, width: 20, height: 20, strokeWidth: 0 });
  const selection = new ActiveSelection([a, b]);
  const beforeA = a.getBoundingRect();
  const beforeB = b.getBoundingRect();
  const initial = selection.getBoundingRect();
  const gesture = new GridSnapDrag({
    canvas: { getZoom: () => 1 },
    isEnabled: () => true,
  });
  gesture.begin({ action: 'drag', target: selection });
  const pos = selection.getXY();
  selection.setXY(new Point(pos.x + 18.4, pos.y + 18.4));
  assert.equal(gesture.move({ target: selection }), true);
  const after = selection.getBoundingRect();
  assert.ok(Math.abs(after.left / 10 - Math.round(after.left / 10)) < 1e-6);
  assert.ok(Math.abs(after.top / 10 - Math.round(after.top / 10)) < 1e-6);
  assert.ok(Math.abs((a.getBoundingRect().left - beforeA.left)
    - (b.getBoundingRect().left - beforeB.left)) < 1e-6);
  assert.ok(Math.abs((a.getBoundingRect().top - beforeA.top)
    - (b.getBoundingRect().top - beforeB.top)) < 1e-6);
  assert.equal(selection.getObjects().length, 2);
  assert.notDeepEqual(selection.getBoundingRect(), initial);
});
