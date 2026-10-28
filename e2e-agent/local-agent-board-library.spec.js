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
  expect(initial.title).toMatch(/^[a-z]+-[a-z]+$/)
  const object = await send(request, 'create', { spec: { type: 'text', text: 'Original', left: 200, top: 140 } })
  const created = await send(request, 'boards.create', { title: 'Algebra A' })
  expect(created.isActive).toBe(true)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  expect((await send(request, 'observe')).objects).toEqual([])
  const formula = await send(request, 'create', { spec: { type: 'formula', latex: 'x^2=4', left: 200, top: 150 } })
  await send(request, 'boards.rename', { boardId: created.id, title: 'Algebra B' })
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()

  await page.getByRole('button', { name: 'Open Board library' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog.getByText('Algebra B')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Save current board to library' })).toHaveCount(0)
  const item = dialog.locator('.board-library-list li').filter({ hasText: 'Algebra B' }).first()
  await expect(item.getByRole('button', { name: 'More actions for Algebra B' })).toBeVisible()
  await expect(item.getByRole('button', { name: 'Delete Algebra B' })).toHaveCount(0)
  await expect(item.getByRole('button', { name: 'Permanently delete' })).toHaveCount(0)
  await expect(item.getByRole('button', { name: 'Rename Algebra B' })).toBeVisible()
  await expect(item.getByRole('button', { name: 'Archive Algebra B' })).toBeVisible()
  await expect(item.locator('.board-library-row-actions').getByRole('button')).toHaveCount(3)
  await item.getByRole('button', { name: 'Rename Algebra B' }).click()
  await item.getByRole('textbox', { name: 'Rename board' }).fill('Algebra B')
  await item.getByRole('button', { name: 'Save name' }).click()
  await expect(item.getByRole('button', { name: 'Rename Algebra B' })).toBeFocused()
  await item.getByRole('button', { name: 'Archive Algebra B' }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(true)
  expect((await send(request, 'observe')).boardId).toBe(initial.id)
  await page.getByRole('button', { name: 'Open Board library' }).click()
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  const archivedItem = dialog.locator('.board-library-trash li').filter({ hasText: 'Algebra B' })
  await expect(archivedItem.getByRole('button', { name: 'Rename Algebra B (unarchive first)' })).toBeDisabled()
  await archivedItem.getByRole('button', { name: 'More actions for Algebra B' }).click()
  await expect(archivedItem.getByRole('button', { name: 'Delete Algebra B' })).toBeFocused()
  await archivedItem.getByRole('button', { name: 'Delete Algebra B' }).click()
  await expect(archivedItem.getByRole('button', { name: 'Permanently delete' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(archivedItem.getByRole('button', { name: 'More actions for Algebra B' })).toBeFocused()
  await expect(archivedItem.getByRole('button', { name: 'Permanently delete' })).toHaveCount(0)
  await archivedItem.getByRole('button', { name: 'Unarchive Algebra B' }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Close board library' }).click()

  await send(request, 'boards.open', { boardId: initial.id })
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  expect((await send(request, 'observe')).objects.some(obj => obj.id === object.id)).toBe(true)
  await send(request, 'boards.open', { boardId: created.id })
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
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

  await page.getByRole('button', { name: 'Open Board library' }).click()
  const current = page.getByRole('dialog', { name: 'Board library' })
  const currentRow = current.locator('.board-library-list li').filter({ hasText: 'Algebra B' }).first()
  await currentRow.getByRole('button', { name: 'More actions for Algebra B' }).click()
  await currentRow.getByRole('button', { name: 'Delete Algebra B' }).click()
  await expect(currentRow.getByText(/Permanently delete.*Algebra B/)).toBeVisible()
  await currentRow.getByRole('button', { name: 'Permanently delete' }).click()
  await expect.poll(async () => (await send(request, 'observe')).boardId).not.toBe(created.id)
  await expect(current).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  expect((await send(request, 'boards.listArchived')).some(board => board.id === created.id)).toBe(false)
  expect((await send(request, 'boards.list')).some(board => board.id === created.id)).toBe(false)
})

test('active board archival/deletion selects the latest remaining board without creating extras', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)

  const original = (await send(request, 'boards.list')).find(board => board.isActive)
  const older = await send(request, 'boards.create', { title: 'Older' })
  const latest = await send(request, 'boards.create', { title: 'Latest' })
  await send(request, 'boards.open', { boardId: older.id })
  const count = (await send(request, 'boards.list')).length
  const archived = await send(request, 'boards.archive', { boardId: older.id })
  expect(archived.id).toBe(older.id)
  expect((await send(request, 'observe')).boardId).toBe(latest.id)
  expect((await send(request, 'boards.list')).length).toBe(count - 1)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()

  await send(request, 'boards.delete', { boardId: latest.id, confirm: true })
  expect((await send(request, 'observe')).boardId).toBe(original.id)
  expect((await send(request, 'boards.list')).length).toBe(1)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()

  // No unarchived alternative: create exactly one fresh empty board.
  await send(request, 'boards.delete', { boardId: original.id, confirm: true })
  const surviving = await send(request, 'boards.list')
  expect(surviving).toHaveLength(1)
  expect(surviving[0].isActive).toBe(true)
  expect(surviving[0].title).toMatch(/^[a-z]+-[a-z]+$/)
})

test('board glyphs select boards from the anchored library', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  // Keep the filter assertion independent of randomly generated names such as geometry-euclid.
  await send(request, 'boards.rename', { boardId: initial.id, title: 'Baseline Algebra' })
  const geometry = await send(request, 'boards.create', { title: 'Geometry' })
  await send(request, 'boards.open', { boardId: initial.id })

  const switcher = page.getByRole('button', { name: 'Open Board library' })
  const switcherBox = await switcher.boundingBox()
  await expect(page.locator('.cookie-banner')).toHaveCount(0)
  await switcher.click()
  let dialog = page.getByRole('dialog', { name: 'Board library' })
  const panelBox = await dialog.boundingBox()
  const search = dialog.getByRole('textbox', { name: 'Find or create a board' })
  await search.fill('Geom')
  const geometryGlyph = dialog.getByRole('button', { name: 'Open Geometry' })
  await expect(geometryGlyph).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Continue with Baseline Algebra' })).toHaveCount(0)
  await expect(dialog.locator('.board-library-list > li')).toHaveCount(1)
  const glyphBox = await geometryGlyph.boundingBox()
  expect(panelBox.y - (switcherBox.y + switcherBox.height)).toBeGreaterThanOrEqual(0)
  expect(panelBox.y - (switcherBox.y + switcherBox.height)).toBeLessThanOrEqual(16)
  expect(glyphBox.y - (switcherBox.y + switcherBox.height)).toBeLessThan(210)
  await geometryGlyph.click()
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.cookie-banner')).toHaveCount(0)

  await page.getByRole('button', { name: 'Open Board library' }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Continue with Geometry' }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'Open Board library' }).click()
  await page.mouse.click(1100, 150)
  await expect(page.getByRole('dialog', { name: 'Board library' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeFocused()

  await send(request, 'boards.archive', { boardId: geometry.id })
  await page.getByRole('button', { name: 'Open Board library' }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  await dialog.getByRole('button', { name: 'Unarchive and open Geometry' }).click()
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  expect((await send(request, 'boards.listArchived')).some(board => board.id === geometry.id)).toBe(false)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open Board library' }).click()
  dialog = page.getByRole('dialog', { name: 'Board library' })
  const mobilePanel = await dialog.boundingBox()
  expect(mobilePanel.x).toBe(0)
  expect(mobilePanel.y).toBe(0)
  expect(mobilePanel.width).toBe(390)
  expect(mobilePanel.height).toBe(844)
  await dialog.getByRole('textbox', { name: 'Find or create a board' }).fill('Vectors')
  await expect(dialog.getByText('No matching boards')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create “Vectors”' }).click()
  await expect(page.getByRole('button', { name: 'Open Board library' })).toBeVisible()
})

test('board library search includes every matching title, including the active board', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)

  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  await send(request, 'boards.rename', { boardId: initial.id, title: 'geometry-euclid' })
  await send(request, 'boards.create', { title: 'Geometry' })
  await send(request, 'boards.open', { boardId: initial.id })

  await page.getByRole('button', { name: 'Open Board library' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  const search = dialog.getByRole('textbox', { name: 'Find or create a board' })
  await search.fill('Geom')

  await expect(dialog.getByRole('button', { name: 'Continue with geometry-euclid' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Open Geometry' })).toBeVisible()
  await expect(dialog.locator('.board-library-list > li')).toHaveCount(2)

  await search.fill('EUCLID')
  await expect(dialog.getByRole('button', { name: 'Continue with geometry-euclid' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Open Geometry' })).toHaveCount(0)
  await expect(dialog.locator('.board-library-list > li')).toHaveCount(1)
})

test('a long board list scrolls while creation stays reachable', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  for (let index = 1; index <= 12; index++) await send(request, 'boards.create', { title: `Lesson ${index}` })
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog.getByRole('button', { name: 'Recent (13)' })).toBeVisible()
  const content = dialog.locator('.board-library-content')
  const dimensions = await content.evaluate(element => ({ visible: element.clientHeight, total: element.scrollHeight }))
  expect(dimensions.total).toBeGreaterThan(dimensions.visible)
  await dialog.getByRole('button', { name: `Open ${initial.title}` }).scrollIntoViewIfNeeded()
  await expect(dialog.getByRole('button', { name: `Open ${initial.title}` })).toBeInViewport()
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
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await dialog.getByRole('button', { name: 'Archived (1)' }).click()
  const glyph = dialog.getByRole('button', { name: 'Unarchive and open Stale board' })
  await expect(glyph).toBeVisible()
  await send(request, 'boards.delete', { boardId: stale.id, confirm: true })
  await glyph.click()
  await expect(dialog.getByRole('alert')).toContainText('Board not found')
  await expect(dialog.getByRole('button', { name: 'Close board library' })).toBeFocused()
})

test('Anchored icon-only actions popover supports mouse, keyboard and confirmed Delete', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)
  const active = (await send(request, 'boards.list')).find(board => board.isActive)
  await send(request, 'boards.create', { title: 'Popover sibling board' })
  await page.getByRole('button', { name: 'Open Board library' }).click()

  const dialog = page.getByRole('dialog', { name: 'Board library' })
  const row = dialog.locator('.board-library-list li').filter({ hasText: active.title }).first()
  const sibling = dialog.locator('.board-library-list li').filter({ hasText: 'Popover sibling board' })
  const more = row.getByRole('button', { name: `More actions for ${active.title}` })
  const popover = row.locator('.board-library-more-menu')
  const deleteAction = row.getByRole('button', { name: `Delete ${active.title}` })
  const confirm = row.getByRole('button', { name: 'Permanently delete' })

  await expect(more).toBeVisible()
  await expect(more).toHaveAttribute('popovertarget', `more-menu-${active.id}`)
  await expect(popover).toBeHidden()
  const rowHeight = await row.evaluate(element => element.getBoundingClientRect().height)
  const siblingY = (await sibling.boundingBox()).y

  await more.click()
  await expect(popover).toBeVisible()
  await expect(deleteAction).toBeFocused()
  await expect(deleteAction).toHaveText('')
  await expect(deleteAction).toHaveAttribute('aria-label', `Delete ${active.title}`)
  expect((await row.evaluate(element => element.getBoundingClientRect().height))).toBe(rowHeight)
  expect((await sibling.boundingBox()).y).toBe(siblingY)
  const popupBox = await popover.boundingBox()
  const moreBox = await more.boundingBox()
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(moreBox.x + moreBox.width + 8)
  expect(popupBox.x + popupBox.width).toBeGreaterThanOrEqual(moreBox.x - 8)

  // Focus moving away must not unmount Delete before a pointer click.
  await deleteAction.evaluate(element => {
    element.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: document.getElementById('board-library-search-input'),
    }))
  })
  await deleteAction.click()
  await expect(confirm).toBeFocused()
  expect((await send(request, 'boards.list')).some(board => board.id === active.id)).toBe(true)

  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(more).toBeFocused()
  await expect(popover).toBeHidden()

  await more.focus()
  await page.keyboard.press('Enter')
  await expect(deleteAction).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await expect(popover).toBeHidden()

  await page.keyboard.press('Enter')
  await expect(deleteAction).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(confirm).toBeFocused()
  await row.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(more).toBeFocused()
  expect((await send(request, 'boards.list')).some(board => board.id === active.id)).toBe(true)

  await more.click()
  await expect(deleteAction).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Find or create a board' }).click()
  await expect(popover).toBeHidden()

  await page.setViewportSize({ width: 320, height: 800 })
  await more.scrollIntoViewIfNeeded()
  await expect(more).toBeInViewport()
  const bounds = await more.boundingBox()
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  await more.click()
  await expect(deleteAction).toBeInViewport()
  await expect(deleteAction).toHaveText('')
})

test('board library isolates drawing shortcuts and returns focus on Escape', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const switcher = page.getByRole('button', { name: 'Open Board library' })
  await switcher.click()
  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog).toBeVisible()
  const closeButton = dialog.getByRole('button', { name: 'Close board library' })
  const lastControl = dialog.getByRole('button', { name: 'About board storage and sync' })
  const lastAction = dialog.getByRole('button', { name: /^More actions for / }).last()
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
  const renameAction = dialog.getByRole('button', { name: /^Rename / })
  await renameAction.click()
  await expect(dialog.getByRole('textbox', { name: 'Rename board' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(renameAction).toBeFocused()
  await lastAction.click()
  const menuDelete = dialog.getByRole('button', { name: /^Delete / })
  await expect(menuDelete).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(lastAction).toBeFocused()
  await expect(menuDelete).toHaveCount(0)
  await lastAction.focus()
  await page.keyboard.press('Enter')
  await expect(menuDelete).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
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
  const switcher = page.getByRole('button', { name: 'Open Board library' })
  await expect(switcher).toHaveAttribute('title', 'Open Board library')

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
    await expect(switcher.locator('.board-library-trigger-label-' + (width <= 360 ? 'short' : 'long'))).toBeVisible()
    await expect(switcher.locator('.board-library-trigger-label-' + (width <= 360 ? 'long' : 'short'))).toBeHidden()
  }
})

test('Board library heading is vertically centered with its icon at mobile and desktop widths', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const selector = page.getByRole('button', { name: 'Open Board library' })

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await selector.click()
    const dialog = page.getByRole('dialog', { name: 'Board library' })
    const heading = await dialog.getByRole('heading', { name: 'Board library' }).boundingBox()
    const icon = await dialog.locator('.board-library-heading-icon').boundingBox()

    expect(heading).not.toBeNull()
    expect(icon).not.toBeNull()
    const headingCenter = heading.y + heading.height / 2
    const iconCenter = icon.y + icon.height / 2
    expect(Math.abs(headingCenter - iconCenter)).toBeLessThanOrEqual(2)
    await dialog.getByRole('button', { name: 'Close board library' }).click()
  }
})

test('storage notice explains local-only retention and expands on mobile', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.getByRole('button', { name: 'Open Board library' }).click()
    const dialog = page.getByRole('dialog', { name: 'Board library' })
    const notice = dialog.getByRole('region', { name: 'Board storage and sync' })
    await expect(notice.getByText('Saved on this device')).toBeVisible()
    await expect(notice.getByText(/No cloud sync/)).toBeVisible()
    const info = notice.getByRole('button', { name: 'About board storage and sync' })
    await expect(info).toHaveAttribute('aria-expanded', 'false')
    await info.click()
    await expect(info).toHaveAttribute('aria-expanded', 'true')
    const details = notice.getByRole('region', { name: 'Board storage details' })
    await expect(details).toContainText('in this browser')
    await expect(details).toContainText('not upload your board documents')
    await expect(details).toContainText('not appear automatically on other devices')
    await expect(details).toContainText('Local storage is not a backup')
    await info.click()
    await expect(info).toHaveAttribute('aria-expanded', 'false')
    await dialog.getByRole('button', { name: 'Close board library' }).click()
  }
})

test('omitted titles from agent and UI generate math-inspired names', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await send(request, 'observe')).stable).toBe(true)

  const initial = (await send(request, 'boards.list')).find(board => board.isActive)
  expect(initial.title).toMatch(/^[a-z]+-[a-z]+$/)

  const agentBoard = await send(request, 'boards.create')
  expect(agentBoard.title).toMatch(/^[a-z]+-[a-z]+$/)
  const switcher = page.getByRole('button', { name: 'Open Board library' })
  await expect(switcher).toBeVisible()
  await switcher.click()

  const dialog = page.getByRole('dialog', { name: 'Board library' })
  await expect(dialog.getByRole('button', { name: `Continue with ${agentBoard.title}` })).toBeVisible()
  await dialog.getByRole('button', { name: 'New board' }).click()
  await expect.poll(async () => (await send(request, 'boards.list')).find(board => board.isActive)?.id).not.toBe(agentBoard.id)

  const current = (await send(request, 'boards.list')).find(board => board.isActive)
  expect(current.title).toMatch(/^[a-z]+-[a-z]+$/)
  await expect(dialog).toHaveCount(0)

  await send(request, 'boards.rename', { boardId: current.id, title: 'My lesson' })
  await expect.poll(async () => (await send(request, 'boards.list')).find(board => board.isActive)?.title).toBe('My lesson')
})
