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

import { test, expect } from '@playwright/test';
import { gotoBoard } from './fixtures.js';
import { getBoardState } from './helpers/canvas.js';

// Production src/ has no test hooks; fault injection belongs to the E2E entry.
test('failed insert Stamp notification restores canvas, active selection and history', async ({ page }) => {
  await gotoBoard(page);
  await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects(
    [{ type: 'rect', left: 250, top: 200, width: 80, height: 70 }],
    { select: true },
  ));
  const before = await getBoardState(page);
  expect(before.objects).toHaveLength(1);
  expect(before.active.selectionCount).toBe(1);
  expect(await page.evaluate(() => window.__MATHBOARD_E2E__.failNextDocumentChange())).toBe(true);

  await expect(page.evaluate(() => window.__MATHBOARD_E2E__.insertKit('cartesianPlane')))
    .rejects.toThrow(/Injected document-change failure/);

  const after = await getBoardState(page);
  expect(after.history).toEqual(before.history);
  expect(after.objects).toEqual(before.objects);
  expect(after.active).toEqual(before.active);

  // The one-shot injector has cleared itself; a subsequent real insertion
  // should commit exactly one undoable add and leave no failed Stamp behind.
  const result = await page.evaluate(() => window.__MATHBOARD_E2E__.insertKit('cartesianPlane').then(
    ({ ok }) => ({ ok }),
  ));
  expect(result.ok).toBe(true);
  const committed = await getBoardState(page);
  expect(committed.objects).toHaveLength(2);
  expect(committed.history.length).toBe(before.history.length + 1);
  expect(committed.history.tipType).toBe('add');
  await page.keyboard.press('ControlOrMeta+Z');
  const undone = await getBoardState(page);
  expect(undone.objects).toEqual(before.objects);
});
