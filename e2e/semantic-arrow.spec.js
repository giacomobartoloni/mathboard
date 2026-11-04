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
import { clickOnCanvas, dragOnCanvas, getBoardState, waitForState } from './helpers/canvas.js';

test('Shapes popup uses equal-sized buttons for Rectangle, Circle, Line and Arrow', async ({ page }) => {
  await gotoBoard(page);
  await page.getByRole('button', { name: 'Shapes', exact: true }).click();
  const submenu = page.getByRole('group', { name: 'Shape options' });
  await expect(submenu).toBeVisible();
  const names = ['Rectangle', 'Circle', 'Line', 'Arrow'];
  const boxes = await Promise.all(names.map((name) => submenu.getByRole('button', {
    name, exact: true,
  }).boundingBox()));
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box.width).toBeCloseTo(boxes[0].width, 1);
    expect(box.height).toBeCloseTo(boxes[0].height, 1);
  }
});

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


test('Arrow endpoints edit independently with the existing Line-style handles and one Undo step', async ({ page }) => {
  await gotoBoard(page);
  await selectShape(page, 'Arrow');
  await dragOnCanvas(page, { x1: 320, y1: 180, x2: 480, y2: 240 });
  await waitForState(page, s => s.objects.length === 1);
  await clickOnCanvas(page, { x: 400, y: 210 });
  const before = await getBoardState(page);
  const id = before.objects[0].mathboardId;
  await dragOnCanvas(page, { x1: 320, y1: 180, x2: 290, y2: 145 });
  const after = await waitForState(page, s => s.history.length === before.history.length + 1);
  expect(after.history.tipType).toBe('modify');
  expect(after.objects).toHaveLength(1);
  expect(after.objects[0].mathboardId).toBe(id);
  let scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].type).toBe('arrow');
  expect(scene.objects[0].x1).toBeCloseTo(290, 1);
  expect(scene.objects[0].y1).toBeCloseTo(145, 1);
  expect(scene.objects[0].x2).toBeCloseTo(480, 1);
  expect(scene.objects[0].y2).toBeCloseTo(240, 1);
  await clickUndo(page);
  await waitForState(page, s => s.history.step === before.history.step);
  scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].x1).toBeCloseTo(320, 1);
  expect(scene.objects[0].y1).toBeCloseTo(180, 1);
  await clickRedo(page);
  await waitForState(page, s => s.history.step === before.history.step + 1);
  scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].x1).toBeCloseTo(290, 1);
  expect(scene.objects[0].x2).toBeCloseTo(480, 1);
});

test('Escape cancels an in-flight Arrow endpoint edit without persisting a change', async ({ page }) => {
  await gotoBoard(page);
  await selectShape(page, 'Arrow');
  await dragOnCanvas(page, { x1: 320, y1: 180, x2: 480, y2: 240 });
  await waitForState(page, s => s.objects.length === 1);
  await clickOnCanvas(page, { x: 400, y: 210 });
  const before = await getBoardState(page);
  const bounds = await page.locator('canvas.upper-canvas').boundingBox();
  await page.mouse.move(bounds.x + 320, bounds.y + 180);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 280, bounds.y + 150, { steps: 10 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const after = await getBoardState(page);
  expect(after.history.length).toBe(before.history.length);
  expect(after.objects[0].mathboardId).toBe(before.objects[0].mathboardId);
  const scene = await page.evaluate(() => window.__MATHBOARD_E2E__.observeBoard());
  expect(scene.objects[0].x1).toBeCloseTo(320, 1);
  expect(scene.objects[0].y1).toBeCloseTo(180, 1);
});
