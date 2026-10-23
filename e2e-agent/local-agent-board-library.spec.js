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

import { expect, test } from '@playwright/test'

const endpoint = '/__mathboard_agent/command'

async function send(request, method, params = {}) {
  const response = await request.post(endpoint, { data: { method, params } })
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()).result
}

test('autosaved local board archive, unarchive and confirmed irreversible delete', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)

  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  expect(initial).toBeTruthy()
  const object = await send(request, 'create', { spec: { type: 'text', text: 'Original', left: 200, top: 140 } })
  const created = await send(request, 'boards.create', { title: 'Algebra A' })
  expect(created.isActive).toBe(true)
  await expect(page.getByRole('button', { name: 'Boards: Algebra A' })).toBeVisible()
  expect((await send(request, 'observe')).objects).toEqual([])
  const formula = await send(request, 'create', { spec: { type: 'formula', latex: 'x^2=4', left: 200, top: 150 } })
  await send(request, 'boards.rename', { boardId: created.id, title: 'Algebra B' })
  await expect(page.getByRole('button', { name: 'Boards: Algebra B' })).toBeVisible()

  await page.getByRole('button', { name: 'Boards: Algebra B' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog.getByText('Algebra B')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save current board to library' })).toHaveCount(0)
  const item = dialog.locator('.board-library-list li').filter({ hasText: 'Algebra B' }).first()
  await expect(item.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
  await item.getByRole('button', { name: 'Actions for Algebra B' }).click()
  await item.getByRole('button', { name: 'Rename', exact: true }).click()
  await item.getByRole('textbox', { name: 'Rename board' }).fill('Algebra B')
  await item.getByRole('button', { name: 'Save name' }).click()
  await expect(item.getByRole('button', { name: 'Actions for Algebra B' })).toBeFocused()
  await item.getByRole('button', { name: 'Actions for Algebra B' }).click()
  await item.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(true)
  expect((await send(request, 'observe')).boardId).not.toBe(created.id)
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  await dialog.locator('.board-library-trash').getByRole('button', { name: 'Unarchive' }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Close board library' }).click()

  await send(request, 'boards.open', { boardId: initial.id })
  await expect(page.getByRole('button', { name: 'Boards: Untitled board' })).toBeVisible()
  expect((await send(request, 'observe')).objects.some(obj => obj.id === object.id)).toBe(true)
  await send(request, 'boards.open', { boardId: created.id })
  await expect(page.getByRole('button', { name: 'Boards: Algebra B' })).toBeVisible()
  expect((await send(request, 'observe')).objects.some(obj => obj.id === formula.id && obj.latex === 'x^2=4')).toBe(true)

  await send(request, 'boards.archive', { boardId: initial.id })
  const cannotOpen = await request.post(endpoint, { data: { method: 'boards.open', params: { boardId: initial.id } } })
  expect(cannotOpen.status()).toBe(409)
  expect((await cannotOpen.json()).error.code).toBe('board_archived')
  await send(request, 'boards.unarchive', { boardId: initial.id })

  const unconfirmed = await request.post(endpoint, { data: { method: 'boards.delete', params: { boardId: initial.id } } })
  expect(unconfirmed.status()).toBe(409)
  expect((await unconfirmed.json()).error.code).toBe('confirmation_required')
  await send(request, 'boards.delete', { boardId: initial.id, confirm: true })
  expect((await send(request, 'boards.list')).some(board => board.id === initial.id)).toBe(false)
  const missing = await request.post(endpoint, { data: { method: 'boards.open', params: { boardId: initial.id } } })
  expect(missing.status()).toBe(409)
  expect((await missing.json()).error.code).toBe('board_not_found')

  await page.getByRole('button', { name: 'Boards: Algebra B' }).click()
  const current = page.getByRole('dialog', { name: 'Board library' })
  const currentRow = current.locator('.board-library-list li').filter({ hasText: 'Algebra B' }).first()
  await currentRow.getByRole('button', { name: 'Actions for Algebra B' }).click()
  await currentRow.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(currentRow.getByText(/Permanently delete.*Algebra B/)).toBeVisible()
  await currentRow.getByRole('button', { name: 'Permanently delete' }).click()
  await expect.poll(async () => (await send(request, 'observe')).boardId).not.toBe(created.id)
  await expect(current.getByRole('button', { name: 'Close board library' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Boards: Untitled board' })).toBeVisible()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(false)
  expect((await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
})

test('board library isolates drawing shortcuts and returns focus on Escape', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const switcher = page.getByRole('button', { name: 'Boards: Untitled board' })
  await switcher.click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog).toBeVisible()
  const closeButton = dialog.getByRole('button', { name: 'Close board library' })
  const lastAction = dialog.getByRole('button', { name: /Actions for/ }).last()
  await expect(closeButton).toBeFocused()
  await expect(lastAction).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(lastAction).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('p')
  await expect(page.locator('.tool-button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Board library' })).toHaveCount(0)
  await expect(switcher).toBeFocused()
})
