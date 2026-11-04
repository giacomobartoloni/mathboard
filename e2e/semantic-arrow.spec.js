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
import { selectShape, clickUndo, clickRedo } from './helpers/board.js';
import { dragOnCanvas, waitForState } from './helpers/canvas.js';

test('UI Arrow creates an editable semantic arrow and can Undo/Redo', async ({ page }) => {
  await gotoBoard(page);
  await selectShape(page, 'Arrow');
  await dragOnCanvas(page, { x1: 320, y1: 180, x2: 480, y2: 240 });
  await waitForState(page, s => s.objects.length === 1);
  let scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].type).toBe('arrow');
  await clickUndo(page);
  await waitForState(page, s => s.objects.length === 0);
  await clickRedo(page);
  await waitForState(page, s => s.objects.length === 1);
  scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].type).toBe('arrow');
});

