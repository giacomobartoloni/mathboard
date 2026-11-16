/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { test, expect } from '@playwright/test'
import { gotoBoard } from './fixtures.js'
import { getBoardState } from './helpers/canvas.js'

const document = title => ({
  format: 'mathboard-board',
  version: 1,
  title,
  objects: [{ id: 'exported_rect', type: 'rect', left: 20, top: 30, width: 70, height: 40 }],
})

const boardFile = (name, title) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(document(title))),
})

test('Import button opens native picker and creates an independent local board', async ({ page }) => {
  const initial = await gotoBoard(page)
  await page.setViewportSize({ width: 320, height: 800 })
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const panel = page.getByRole('dialog', { name: 'Board library' })
  const plus = panel.getByRole('button', { name: 'New board' })
  const importButton = panel.getByRole('button', { name: 'Import board' })
  const search = panel.getByRole('textbox', { name: 'Find or create a board' })
  const [plusBox, importBox, searchBox] = await Promise.all([plus.boundingBox(), importButton.boundingBox(), search.boundingBox()])
  expect(importBox.x).toBeGreaterThan(plusBox.x + plusBox.width)
  expect(searchBox.x).toBeGreaterThan(importBox.x + importBox.width)
  expect(searchBox.width).toBeGreaterThan(80)

  // The native picker must not filter out .mathboard custom extensions.
  await expect(panel.locator('input[type="file"]')).not.toHaveAttribute('accept')
  const chooserEvent = page.waitForEvent('filechooser')
  await importButton.click()
  const chooser = await chooserEvent
  await chooser.setFiles(boardFile('Lesson.mathboard', 'Imported Algebra'))
  await expect.poll(async () => (await getBoardState(page)).boardId).not.toBe(initial.boardId)
  await expect(panel).toHaveCount(0)
  const imported = await getBoardState(page)
  expect(imported.objects).toHaveLength(1)
  expect(imported.objects[0].mathboardId).not.toBe('exported_rect')

  await page.getByRole('button', { name: 'Open Board library' }).click()
  await expect(page.getByRole('dialog', { name: 'Board library' })).toContainText('Imported Algebra')
})

test('dropping a legacy .mathboard.json file highlights the panel and opens the copy', async ({ page }) => {
  const initial = await gotoBoard(page)
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const highlighted = await page.evaluate(async json => {
    const panel = document.getElementById('library-sidebar-panel')
    const transfer = new DataTransfer()
    transfer.items.add(new File([json], 'export.mathboard.json', { type: 'application/json' }))
    const fire = type => panel.dispatchEvent(new DragEvent(type, {
      bubbles: true, cancelable: true, dataTransfer: transfer,
    }))
    fire('dragenter')
    await new Promise(resolve => requestAnimationFrame(resolve))
    const visible = Boolean(panel.querySelector('.board-library-import-overlay'))
    fire('dragover')
    fire('drop')
    return visible
  }, JSON.stringify(document('Dropped Geometry')))
  expect(highlighted).toBe(true)
  await expect.poll(async () => (await getBoardState(page)).boardId).not.toBe(initial.boardId)
  await expect(page.getByRole('dialog', { name: 'Board library' })).toHaveCount(0)
})

test('invalid input keeps the current board and allows retry with the same picker', async ({ page }) => {
  const initial = await gotoBoard(page)
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const panel = page.getByRole('dialog', { name: 'Board library' })
  const importButton = panel.getByRole('button', { name: 'Import board' })
  const firstChoice = page.waitForEvent('filechooser')
  await importButton.click()
  await (await firstChoice).setFiles({ name: 'corrupt.mathboard', mimeType: 'application/json', buffer: Buffer.from('{invalid') })
  await expect(panel.getByRole('alert')).toContainText('not a valid MathBoard board file')
  expect((await getBoardState(page)).boardId).toBe(initial.boardId)
  await expect(importButton).toBeEnabled()
  const retryChoice = page.waitForEvent('filechooser')
  await importButton.click()
  await (await retryChoice).setFiles(boardFile('corrupt.mathboard', 'Recovered Lesson'))
  await expect.poll(async () => (await getBoardState(page)).boardId).not.toBe(initial.boardId)
})

test('dropping multiple files fails without replacing the active board', async ({ page }) => {
  const initial = await gotoBoard(page)
  await page.getByRole('button', { name: 'Open Board library' }).click()
  await page.evaluate(json => {
    const panel = document.getElementById('library-sidebar-panel')
    const transfer = new DataTransfer()
    for (const name of ['a.mathboard', 'b.mathboard']) {
      transfer.items.add(new File([json], name, { type: 'application/json' }))
    }
    panel.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }, JSON.stringify(document('Duplicate')))
  const panel = page.getByRole('dialog', { name: 'Board library' })
  await expect(panel.getByRole('alert')).toContainText('one .mathboard file at a time')
  expect((await getBoardState(page)).boardId).toBe(initial.boardId)
})

test('pinned Library stays visible after a successful import', async ({ page }) => {
  const initial = await gotoBoard(page)
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.getByRole('button', { name: 'Open Board library' }).click()
  const panel = page.getByRole('dialog', { name: 'Board library' })
  await panel.getByRole('button', { name: 'Pin sidebar' }).click()
  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import board' }).click()
  await (await chooserEvent).setFiles(boardFile('pinned.mathboard', 'Pinned Import'))
  await expect.poll(async () => (await getBoardState(page)).boardId).not.toBe(initial.boardId)
  await expect(page.locator('#library-sidebar-panel')).toBeVisible()
  await expect(page.locator('#library-sidebar-panel')).toContainText('Pinned Import')
})
