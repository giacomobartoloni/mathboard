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

test('local agent and user library share saved editable boards', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)

  const before = await send(request, 'boards.list')
  expect(before.some(board => board.isActive)).toBe(true)
  const initial = before.find(board => board.isActive)
  const original = await send(request, 'create', { spec: { type: 'text', text: 'Original', left: 200, top: 140 } })
  const created = await send(request, 'boards.create', { title: 'Algebra A' })
  expect(created.kind).toBe('scratch')
  expect((await send(request, 'observe')).boardId).toBe(created.id)
  expect((await send(request, 'observe')).objects).toEqual([])
  const added = await send(request, 'create', { spec: { type: 'formula', latex: 'x^2=4', left: 200, top: 150 } })
  const renamed = await send(request, 'boards.rename', { boardId: created.id, title: 'Algebra B' })
  expect(renamed.title).toBe('Algebra B')
  expect((await send(request, 'boards.save')).kind).toBe('saved')
  const list = await send(request, 'boards.list')
  expect(list.find(board => board.id === created.id).kind).toBe('saved')

  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Algebra B')).toBeVisible()
  await expect(dialog.getByText('Saved', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close board library' }).click()

  await send(request, 'boards.open', { boardId: initial.id })
  const back = await send(request, 'observe')
  expect(back.boardId).toBe(initial.id)
  expect(back.objects.some(obj => obj.id === original.id)).toBe(true)
  await send(request, 'boards.open', { boardId: created.id })
  const restored = await send(request, 'observe')
  expect(restored.objects.some(obj => obj.id === added.id && obj.latex === 'x^2=4')).toBe(true)

  const invalid = await request.post(endpoint, { data: { method: 'boards.rename', params: { boardId: created.id, title: '' } } })
  expect(invalid.status()).toBe(409)
  expect((await invalid.json()).error.code).toBe('invalid_board_title')
})
