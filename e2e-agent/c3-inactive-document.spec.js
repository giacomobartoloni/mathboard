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

async function command(request, method, params = {}) {
  const response = await request.post('/__mathboard_agent/command', { data: { method, params } })
  expect(response.ok()).toBe(true)
  const body = await response.json()
  expect(body.ok, JSON.stringify(body.error)).toBe(true)
  return body.result
}

test('inactive document commits render in Chromium with stable IDs and Formula geometry', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  expect(await page.locator('#board').evaluate(element =>
    typeof element.__vueParentComponent?.proxy?.getBoardDocumentCommands)).toBe('function')
  const live = await command(request, 'create', { spec: { type: 'rect', width: 15, height: 15, left: 10,
    top: 10 }, options: { select: true } })
  const active = await command(request, 'observe')
  const result = await page.evaluate(async () => {
    const { runInactiveBrowser } = await import('/e2e-agent/helpers/c3-inactive-browser.js')
    const service = document.querySelector('#board').__vueParentComponent.proxy.getBoardDocumentCommands()
    return runInactiveBrowser(service)
  })
  const stillActive = await command(request, 'observe')
  expect(stillActive.boardId).toBe(active.boardId)
  expect(stillActive.objects).toEqual(active.objects)
  expect(result.observed.viewport).toBeNull()
  expect(result.persisted.revision).toBe(6)
  expect(result.invalidLatexCode).toBe('formula_render_failed')
  expect(result.persisted.objects.map(object => object.id)).toEqual([result.created[2].id, result.group.id])
  expect(result.persisted.objects[0].latex).toBe('x^2=9')
  expect(result.persisted.objects[0].objects).toBeUndefined()
  expect(result.persisted.objects[0].id).toBe(result.created[2].id)
  expect(result.persisted.objects[1].objects[1].mathboardInkMode).toBe('auto')

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(object => object.id)).toEqual([])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(object => object.id)).toEqual([live.id])

  await command(request, 'boards.open', { boardId: result.targetId })
  const opened = await command(request, 'observe')
  expect(opened.objects.map(object => object.id)).toEqual([result.created[2].id, result.group.id])
  const liveMeasure = await command(request, 'measure', { id: result.created[2].id })
  for (const key of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(liveMeasure[key] - result.updatedMeasure[key])).toBeLessThan(0.5)
  }
})

test('all nine inactive methods retain live semantic behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const result = await page.evaluate(async () => {
    const { IndexedDbBoardRepository, createBoardRecord } = await import('/src/storage/local/IndexedDbBoardRepository.js')
    const board = document.querySelector('#board').__vueParentComponent.proxy
    const service = board.getBoardDocumentCommands()
    const activeId = board.getBoardId()
    const repository = new IndexedDbBoardRepository()
    const target = await repository.create(createBoardRecord({ title: 'Parity target',
      document: { format: 'mathboard-board', version: 1, title: 'Parity target', objects: [] } }))
    const run = (boardId, method, params = {}) => service.executeOnBoard({ boardId, method, params },
      { expiresAtMs: Date.now() + 10000 })
    const stripIds = value => {
      if (Array.isArray(value)) return value.map(stripIds)
      if (!value || typeof value !== 'object') return value
      return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id')
        .map(([key, item]) => [key, stripIds(item)]))
    }
    const sequence = async boardId => {
      const snapshots = []
      const record = async method => snapshots.push({ method,
        objects: stripIds((await run(boardId, 'observe')).objects) })
      const first = await run(boardId, 'create', { spec: { type: 'rect', width: 10, height: 20, left: 30, top: 40 } })
      await record('create')
      const pair = await run(boardId, 'createMany', { specs: [
        { type: 'rect', width: 15, height: 15, left: 100, top: 80 },
        { type: 'rect', width: 20, height: 10, left: 140, top: 80 },
      ] })
      await record('createMany')
      await run(boardId, 'update', { id: first.id, patch: { left: 50 } })
      await record('update')
      const measured = stripIds(await run(boardId, 'measure', { id: first.id }))
      const group = await run(boardId, 'group', { ids: pair.map(object => object.id) })
      await record('group')
      await run(boardId, 'delete', { id: first.id })
      await record('delete')
      await run(boardId, 'deleteMany', { ids: [group.id] })
      await record('deleteMany')
      await run(boardId, 'create', { spec: { type: 'rect', width: 5, height: 5 } })
      await run(boardId, 'clear')
      await record('clear')
      return { snapshots, measured }
    }
    return { active: await sequence(activeId), inactive: await sequence(target.id) }
  })
  expect(result.inactive.snapshots).toEqual(result.active.snapshots)
  for (const key of ['left', 'top', 'width', 'height']) {
    expect(Math.abs(result.inactive.measured[key] - result.active.measured[key])).toBeLessThan(0.5)
  }
})
