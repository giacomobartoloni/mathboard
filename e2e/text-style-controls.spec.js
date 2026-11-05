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
import { selectTool, clickUndo } from './helpers/board.js';
import { clickOnCanvas, getBoardState, waitForState } from './helpers/canvas.js';

test('text font and size controls produce history-safe semantic text updates', async ({ page }) => {
  await gotoBoard(page);
  await selectTool(page, 'Text');
  await clickOnCanvas(page, { x: 340, y: 250 });
  const input = page.locator('textarea').first();
  await expect(input).toBeAttached();
  await input.fill('vector');
  await page.keyboard.press('Escape');
  await waitForState(page, s => s.objects.some(o => o.text === 'vector'));
  await selectTool(page, 'Select');
  // The newly committed IText can remain selected; clicking it again opens
  // native Fabric text editing, which intentionally hides formatting controls.
  await clickOnCanvas(page, { x: 650, y: 430 });
  await clickOnCanvas(page, { x: 360, y: 270 });
  const family = page.getByRole('combobox', { name: 'Text font family' });
  const size = page.getByRole('combobox', { name: 'Text font size' });
  await expect(family).toBeVisible();
  await family.selectOption('serif');
  await size.selectOption('48');
  await expect.poll(async () => {
    const scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
    return [scene.objects[0].fontFamily, scene.objects[0].fontSize];
  }).toEqual(['serif', 48]);
  const beforeUndo = await getBoardState(page);
  expect(beforeUndo.history.tipType).toBe('modify');
  await clickUndo(page);
  const undone = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(undone.objects[0].fontSize).not.toBe(48);
});
