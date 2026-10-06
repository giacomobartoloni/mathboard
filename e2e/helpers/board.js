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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

export async function selectTool(page, testId) {
  await page.getByTestId(testId).click()
}

export async function selectShape(page, shapeTestId) {
  const shapes = page.getByTestId('tool-shapes')
  await shapes.click()
  await shapes.hover()
  await page.getByTestId(shapeTestId).click()
}

export async function clickUndo(page) {
  await page.getByTestId('history-undo').click()
}

export async function clickRedo(page) {
  await page.getByTestId('history-redo').click()
}

export async function insertStamp(page, stampTestId) {
  const stamps = page.getByTestId('tool-stamps')
  await stamps.hover()
  await page.getByTestId(stampTestId).click()
}
