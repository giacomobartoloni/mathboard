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
  await expect(item.getByRole('button', { name: 'Actions for Algebra B' })).toHaveCount(0)
  await expect(item.getByRole('button', { name: 'Rename Algebra B' })).toBeVisible()
  await expect(item.getByRole('button', { name: 'Archive Algebra B' })).toBeVisible()
  await expect(item.getByRole('button', { name: 'Delete Algebra B' })).toBeVisible()
  await item.getByRole('button', { name: 'Rename Algebra B' }).click()
  await item.getByRole('textbox', { name: 'Rename board' }).fill('Algebra B')
  await item.getByRole('button', { name: 'Save name' }).click()
  await expect(item.getByRole('button', { name: 'Rename Algebra B' })).toBeFocused()
  await item.getByRole('button', { name: 'Archive Algebra B' }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(true)
  expect((await send(request, 'observe')).boardId).not.toBe(created.id)
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  const archivedItem = dialog.locator('.board-library-trash li').filter({ hasText: 'Algebra B' })
  await expect(archivedItem.getByRole('button', { name: 'Rename Algebra B (unarchive first)' })).toBeDisabled()
  await expect(archivedItem.getByRole('button', { name: 'Delete Algebra B' })).toBeVisible()
  await archivedItem.getByRole('button', { name: 'Unarchive Algebra B' }).click()
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
  await currentRow.getByRole('button', { name: 'Delete Algebra B' }).click()
  await expect(currentRow.getByText(/Permanently delete.*Algebra B/)).toBeVisible()
  await currentRow.getByRole('button', { name: 'Permanently delete' }).click()
  await expect.poll(async () => (await send(request, 'observe')).boardId).not.toBe(created.id)
  await expect(current.getByRole('button', { name: 'Close board library' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Boards: Untitled board' })).toBeVisible()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(false)
  expect((await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
})

test('board glyphs select boards from the anchored library', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  const geometry = await send(request, 'boards.create', { title: 'Geometry' })
  await send(request, 'boards.open', { boardId: initial.id })

  const switcher = page.getByRole('button', { name: 'Boards: Untitled board' })
  const switcherBox = await switcher.boundingBox()
  await expect(page.locator('.cookie-banner')).toBeVisible()
  await switcher.click()
  await expect(page.locator('.cookie-banner')).toBeHidden()
  let dialog = page.getByRole('dialog', { name: 'Board library' })
  const panelBox = await dialog.boundingBox()
  const search = dialog.getByRole('textbox', { name: 'Find or create a board' })
  await search.fill('Geom')
  const geometryGlyph = dialog.getByRole('button', { name: 'Open Geometry' })
  await expect(geometryGlyph).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Continue with Untitled board' })).toHaveCount(0)
  const glyphBox = await geometryGlyph.boundingBox()
  expect(panelBox.y - (switcherBox.y + switcherBox.height)).toBeGreaterThanOrEqual(0)
  expect(panelBox.y - (switcherBox.y + switcherBox.height)).toBeLessThanOrEqual(16)
  expect(glyphBox.y - (switcherBox.y + switcherBox.height)).toBeLessThan(210)
  await geometryGlyph.click()
  await expect(page.getByRole('button', { name: 'Boards: Geometry' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.cookie-banner')).toBeVisible()

  await page.getByRole('button', { name: 'Boards: Geometry' }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Continue with Geometry' }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'Boards: Geometry' }).click()
  await page.mouse.click(1100, 150)
  await expect(page.getByRole('dialog', { name: 'Board library' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Boards: Geometry' })).toBeFocused()

  await send(request, 'boards.archive', { boardId: geometry.id })
  await page.getByRole('button', { name: /^Boards:/ }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  await dialog.getByRole('button', { name: 'Unarchive and open Geometry' }).click()
  await expect(page.getByRole('button', { name: 'Boards: Geometry' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect((await send(request, 'boards.listArchived')).some(board => board.id === geometry.id)).toBe(false)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Boards: Geometry' }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  const mobilePanel = await dialog.boundingBox()
  expect(mobilePanel.x).toBe(0)
  expect(mobilePanel.y).toBe(0)
  expect(mobilePanel.width).toBe(390)
  expect(mobilePanel.height).toBe(844)
  await dialog.getByRole('textbox', { name: 'Find or create a board' }).fill('Vectors')
  await expect(dialog.getByText('No matching boards')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create “Vectors”' }).click()
  await expect(page.getByRole('button', { name: 'Boards: Vectors' })).toBeVisible()
})

test('a long board list scrolls while creation stays reachable', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  for (let index = 1; index <= 12; index++) await send(request, 'boards.create', { title: `Lesson ${index}` })
  await page.getByRole('button', { name: 'Boards: Lesson 12' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog.getByRole('button', { name: 'Recent (13)' })).toBeVisible()
  const content = dialog.locator('.board-library-content')
  const dimensions = await content.evaluate(element => ({ visible: element.clientHeight, total: element.scrollHeight }))
  expect(dimensions.total).toBeGreaterThan(dimensions.visible)
  await dialog.getByRole('button', { name: 'Open Untitled board' }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: 'Open Untitled board' })).toBeInViewport()
  const panelBox = await dialog.boundingBox()
  const createBox = await dialog.getByRole('button', { name: 'New board' }).boundingBox()
  expect(createBox.y + createBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
  await expect(dialog.getByRole('button', { name: 'New board' })).toBeInViewport()
})

test('a failed board selection reports the error and keeps focus in the library', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  const stale = await send(request, 'boards.create', { title: 'Stale board' })
  await send(request, 'boards.archive', { boardId: stale.id })
  await page.getByRole('button', { name: /^Boards:/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  const glyph = dialog.getByRole('button', { name: 'Unarchive and open Stale board' })
  await expect(glyph).toBeVisible()
  await send(request, 'boards.delete', { boardId: stale.id, confirm: true })
  await glyph.click()
  await expect(dialog.getByRole('alert')).toContainText('Board not found')
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
})

test('board library isolates drawing shortcuts and returns focus on Escape', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const switcher = page.getByRole('button', { name: 'Boards: Untitled board' })
  await switcher.click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog).toBeVisible()
  const closeButton = dialog.getByRole('button', { name: 'Close board library' })
  const lastControl = dialog.getByRole('button', { name: 'New board' })
  const lastAction = dialog.getByRole('button', { name: /^Delete / }).last()
  await expect(closeButton).toBeFocused()
  await expect(lastAction).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(lastControl).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(closeButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('textbox', { name: 'Find or create a board' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(closeButton).toBeFocused()
  const renameAction = dialog.getByRole('button', { name: 'Rename Untitled board' })
  await renameAction.click()
  await expect(dialog.getByRole('textbox', { name: 'Rename board' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(renameAction).toBeFocused()
  await lastAction.click()
  await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(lastAction).toBeFocused()
  await page.keyboard.press('p')
  await expect(page.locator('.tool-button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Board library' })).toHaveCount(0)
  await expect(switcher).toBeFocused()
})

test('mobile board selector stays beside the logo in the top row', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  const logo = page.locator('.logo')
  const switcher = page.getByRole('button', { name: /^Boards:/ })

  for (const width of [320, 390, 600]) {
    await page.setViewportSize({ width, height: 800 })
    const logoBox = await logo.boundingBox()
    const selectorBox = await switcher.boundingBox()

    expect(logoBox).not.toBeNull()
    expect(selectorBox).not.toBeNull()
    expect(selectorBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width + 6)
    expect(selectorBox.x + selectorBox.width).toBeLessThanOrEqual(width - 6)
    expect(Math.abs(
      (logoBox.y + logoBox.height / 2) - (selectorBox.y + selectorBox.height / 2),
    )).toBeLessThanOrEqual(8)
    await expect(switcher).toBeInViewport()
  }
})
