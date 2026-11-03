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
import { dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js';

test('Ctrl/Cmd copy paste and cut use editable objects and atomic history', async ({ page }) => {
  await gotoBoard(page);
  await selectShape(page, 'Rectangle');
  await dragOnCanvas(page, { x1: 300, y1: 180, x2: 380, y2: 250 });
  await selectShape(page, 'Circle');
  await dragOnCanvas(page, { x1: 470, y1: 240, x2: 520, y2: 280 });
  await waitForState(page, s => s.objects.length === 2);

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  let state = await waitForState(page, s => s.objects.length === 4);
  expect(state.history.tipType).toBe('batch-add');
  const ids = state.objects.map(o => o.mathboardId);
  expect(new Set(ids).size).toBe(4);

  await clickUndo(page);
  await waitForState(page, s => s.objects.length === 2);
  await clickRedo(page);
  await waitForState(page, s => s.objects.length === 4);

  // Paste selected exactly two roots; cutting must be one delete history step.
  await page.keyboard.press('ControlOrMeta+x');
  state = await waitForState(page, s => s.objects.length === 2);
  expect(state.history.tipType).toBe('delete');
  await page.keyboard.press('ControlOrMeta+v');
  state = await waitForState(page, s => s.objects.length === 4);
  expect(state.history.tipType).toBe('batch-add');
  expect(new Set(state.objects.map(o => o.mathboardId)).size).toBe(4);
});
