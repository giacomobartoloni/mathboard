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

import { test, expect } from '@playwright/test';
import { gotoBoard } from './fixtures.js';
import { selectShape } from './helpers/board.js';
import { dragOnCanvas, waitForState } from './helpers/canvas.js';

test('Shift during creation constrains a new Line to horizontal', async ({ page }) => {
  await gotoBoard(page);
  await selectShape(page, 'Line');
  await page.keyboard.down('Shift');
  try {
    await dragOnCanvas(page, { x1: 320, y1: 180, x2: 460, y2: 215 });
  } finally {
    await page.keyboard.up('Shift');
  }
  await waitForState(page, s => s.objects.length === 1);
  const scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  const line = scene.objects[0];
  expect(line.type).toBe('line');
  expect(Math.abs(line.y2 - line.y1)).toBeLessThan(0.1);
});

