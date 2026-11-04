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
import { orthogonalEndpoint } from '../src/board/geometry/angleConstraints.js';

test('Shift orthogonal endpoint constrains to the dominant horizontal axis', () => {
  assert.deepEqual(orthogonalEndpoint({ x: 20, y: 20 }, { x: 95, y: 68 }), { x: 95, y: 20 });
  assert.deepEqual(orthogonalEndpoint({ x: 20, y: 20 }, { x: -40, y: -20 }), { x: -40, y: 20 });
});

test('Shift orthogonal endpoint constrains to the dominant vertical axis', () => {
  assert.deepEqual(orthogonalEndpoint({ x: 20, y: 20 }, { x: 65, y: -100 }), { x: 20, y: -100 });
  assert.deepEqual(orthogonalEndpoint({ x: 20, y: 20 }, { x: 10, y: 90 }), { x: 20, y: 90 });
});

test('equal displacement prefers horizontal with the original anchor unchanged', () => {
  const anchor = { x: 7, y: -3 };
  assert.deepEqual(orthogonalEndpoint(anchor, { x: 21, y: 11 }), { x: 21, y: -3 });
  assert.deepEqual(anchor, { x: 7, y: -3 });
});
