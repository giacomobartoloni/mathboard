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

export async function selectTool(page, name) {
  await page.getByRole('button', { name, exact: true }).click()
}

export async function selectShape(page, name) {
  const trigger = page.getByRole('button', { name: 'Shapes', exact: true })
  await trigger.click()
  await trigger.hover()
  await page.getByRole('button', { name, exact: true }).click()
}

export async function clickUndo(page) {
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
}

export async function clickRedo(page) {
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
}

export async function insertStamp(page, name) {
  const trigger = page.getByRole('button', { name: 'Stamps', exact: true })
  await trigger.hover()
  await page.getByRole('button', { name, exact: true }).click()
}
