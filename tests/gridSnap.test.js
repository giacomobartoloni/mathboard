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
import {
  nearestGridCoordinate, effectiveGridStep, snapDragAnchor,
} from '../src/board/geometry/gridSnap.js';

test('40-unit macrogrid includes both 1/4 and 1/5 subdivisions, including negatives', () => {
  assert.equal(effectiveGridStep({ zoom: 1 }), 10);
  assert.equal(effectiveGridStep({ zoom: 1, subdivisions: 5 }), 8);
  for (const subdivisions of [4, 5]) {
    const step = 40 / subdivisions;
    for (const value of [-80, -40, 0, 40, 80]) {
      assert.equal(nearestGridCoordinate(value, step), value);
    }
  }
  assert.equal(nearestGridCoordinate(-15, 10), -20);
  assert.equal(nearestGridCoordinate(15, 10), 20);
  assert.equal(nearestGridCoordinate(-7, 10), -10);
  assert.equal(nearestGridCoordinate(23, 8), 24);
  assert.equal(nearestGridCoordinate(2, 0), 2);
  assert.equal(nearestGridCoordinate(Infinity, 10), Infinity);
});

test('capture is magnetic per axis, not rigid quantization', () => {
  assert.deepEqual(snapDragAnchor({ x: 78, y: 93, zoom: 1, step: 10 }),
    { dx: 2, dy: 0, latchX: 80, latchY: null });
  assert.deepEqual(snapDragAnchor({ x: 93, y: 84, zoom: 1, step: 10 }),
    { dx: 0, dy: 0, latchX: null, latchY: null });
  assert.deepEqual(snapDragAnchor({ x: -7.8, y: -10.2, zoom: 1, step: 10 }),
    { dx: -2.2, dy: 0.1999999999999993, latchX: -10, latchY: -10 });
});

test('latch releases beyond threshold and Alt bypass clears both axes', () => {
  const captured = snapDragAnchor({ x: 78, y: 50, step: 10, zoom: 1 });
  const near = snapDragAnchor({
    x: 76.4, y: 50, step: 10, zoom: 1,
    latchX: captured.latchX, latchY: captured.latchY,
  });
  assert.ok(Math.abs(near.dx - 3.6) < 1e-10);
  assert.equal(near.latchX, 80);
  const released = snapDragAnchor({ x: 76.1, y: 50, step: 10, zoom: 1, latchX: 80 });
  assert.equal(released.latchX, null);
  assert.equal(released.dx, 0);
  assert.deepEqual(snapDragAnchor({ x: 80, y: 50, step: 10, zoom: 1, latchX: 80, bypass: true }),
    { dx: 0, dy: 0, latchX: null, latchY: null });
});

test('zoom-dependent CSS pixel tolerance and fallback remain bounded', () => {
  assert.equal(effectiveGridStep({ zoom: 0.1 }), null);
  assert.equal(effectiveGridStep({ zoom: 0.5 }), 40);
  assert.equal(effectiveGridStep({ zoom: 0.8 }), 10);
  assert.equal(effectiveGridStep({ zoom: 1 }), 10);
  assert.equal(effectiveGridStep({ zoom: 2 }), 10);
  assert.equal(effectiveGridStep({ zoom: 5 }), 10);
  assert.equal(effectiveGridStep({ zoom: -1 }), null);
  assert.equal(effectiveGridStep({ zoom: Number.NaN }), null);
  assert.equal(effectiveGridStep({ zoom: 1, subdivisions: 0 }), null);
  assert.equal(snapDragAnchor({ x: 78.5, y: 93, zoom: 2, step: 10 }).dx, 0);
  assert.equal(snapDragAnchor({ x: 79, y: 93, zoom: 2, step: 10 }).dx, 1);
  // Pan and devicePixelRatio are deliberately absent: scene grid and CSS px suffice.
});

test('invalid coordinates never become a transform or latch', () => {
  for (const options of [
    { x: Number.NaN, y: 20, step: 10, zoom: 1 },
    { x: 10, y: Infinity, step: 10, zoom: 1 },
    { x: 10, y: 20, step: 0, zoom: 1 },
    { x: 10, y: 20, step: 10, zoom: 0 },
    { x: 10, y: 20, step: 10, zoom: 1, capturePx: 4, releasePx: 3 },
  ]) {
    assert.deepEqual(snapDragAnchor(options),
      { dx: 0, dy: 0, latchX: null, latchY: null });
  }
});
