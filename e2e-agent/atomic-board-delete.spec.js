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
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(200)
  expect(body.ok).toBe(true)
  return body.result
}
const observe = (request) => command(request, 'observe')
const idsOf = (objects) => objects.map(({ id }) => id)

// Development-only fault injection reaches Vue's existing dev instance. No
// application hook, global API or production instrumentation is installed.
async function inspectBoard(page, action) {
  return page.evaluate(async (action) => {
    function find(vnode) {
      if (!vnode) return null
      if (vnode.component?.type?.name === 'DrawBoard') return vnode.component.proxy
      const nested = vnode.component && find(vnode.component.subTree)
      if (nested) return nested
      for (const child of Array.isArray(vnode.children) ? vnode.children : []) {
        const found = find(child)
        if (found) return found
      }
      return null
    }
    const board = find(document.querySelector('#app').__vue_app__._instance.subTree)
    if (!board) throw new Error('Development DrawBoard instance unavailable')
    if (action === 'fail-notify') {
      board._originalNotify = board._notifyDocumentChanged
      board._notifyDocumentChanged = () => { throw new Error('Injected persistence notification failure') }
    }
    if (action === 'restore-notify') board._notifyDocumentChanged = board._originalNotify
    if (action === 'fail-remove') {
      board.canvas._originalRemove = board.canvas.remove
      let count = 0
      board.canvas.remove = function (...objects) {
        const result = this._originalRemove(...objects)
        if (++count === 2) throw new Error('Injected failure after second removal')
        return result
      }
    }
    if (action === 'restore-remove') board.canvas.remove = board.canvas._originalRemove
    if (action === 'transform-selection') {
      const selected = board.canvas.getActiveObject()
      selected.set({ left: 550, top: 350, angle: 23, scaleX: 1.3, scaleY: 0.8, skewX: 8 })
      selected.setCoords()
    }
    if (action === 'flush') await board.flushPersistence()
    const active = board.canvas.getActiveObject()
    return {
      history: board._history.map(({ type, entries }) => ({ type, ids: entries?.map(({ object }) => object.mathboardId) })),
      step: board._historyStep,
      tip: board._historyTipKind,
      selected: board.canvas.getActiveObjects().map((object) => object.mathboardId),
      selectionTransform: active ? { left: active.left, top: active.top, angle: active.angle, scaleX: active.scaleX, scaleY: active.scaleY } : null,
    }
  }, action)
}

async function ready(page, request) {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'observe' } })
    return response.ok() && (await response.json()).result.stable
  }).toBe(true)
}

const specs = [
  { type: 'rect', left: 350, top: 200, width: 80, height: 50 },
  { type: 'formula', latex: 'x^2+1', left: 500, top: 230, mathboardInkMode: 'fixed', fill: '#1864ab' },
  { type: 'group', left: 700, top: 400, objects: [
    { type: 'rect', width: 40, height: 30 },
    { type: 'formula', latex: 'y=2', left: 60 },
  ] },
]

test('HTTP deleteMany and clear each replay as one command and preserve editable persistent formulas', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs })
  const ids = idsOf(nodes)
  const before = await observe(request)
  const removed = await command(request, 'deleteMany', { ids: [ids[2], ids[0]] })
  expect(idsOf(removed)).toEqual([ids[0], ids[2]])
  expect(idsOf((await observe(request)).objects)).toEqual([ids[1]])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(ids)
  expect((await observe(request)).objects).toEqual(before.objects)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual([ids[1]])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(ids)

  expect(idsOf(await command(request, 'clear'))).toEqual(ids)
  expect((await observe(request)).objects).toEqual([])
  // Both empty calls must retain the clear command's redo tail.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(ids)
  expect(await command(request, 'deleteMany', { ids: [] })).toEqual([])
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects).toEqual([])
  expect(await command(request, 'clear')).toEqual([])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(ids)
  expect((await observe(request)).boardId).toBe(before.boardId)

  await command(request, 'update', { id: ids[1], patch: { latex: 'x^2+2' } })
  await inspectBoard(page, 'flush')
  await page.reload()
  await expect.poll(async () => {
    const response = await request.get('/__mathboard_agent/health')
    return (await response.json()).browserConnected
  }).toBe(true)
  await expect.poll(async () => (await observe(request)).objects.find(({ id }) => id === ids[1])?.latex).toBe('x^2+2')
  const restored = await observe(request)
  expect(idsOf(restored.objects)).toEqual(ids)
  expect(restored.objects[2].objects.map(({ id }) => id)).toEqual(nodes[2].objects.map(({ id }) => id))
  await command(request, 'update', { id: ids[1], patch: { latex: 'x^2+3' } })
  expect((await observe(request)).objects[1].latex).toBe('x^2+3')
})

test('HTTP invalid deletion leaves selection, scene and history unchanged', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs, options: { select: true } })
  const before = await observe(request)
  const history = await inspectBoard(page)
  for (const [ids, code] of [
    [[nodes[0].id, nodes[0].id], 'invalid_object_spec'],
    [[nodes[0].id, null], 'invalid_object_spec'],
    [[nodes[0].id, 'missing'], 'object_not_found'],
    [[nodes[0].id, nodes[2].objects[0].id], 'nested_object_mutation_not_supported'],
  ]) {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'deleteMany', params: { ids } } })
    expect(response.status()).toBe(409)
    expect((await response.json()).error.code).toBe(code)
    expect(await observe(request)).toEqual(before)
    expect(await inspectBoard(page)).toEqual(history)
  }
})

for (const failure of ['notify', 'remove']) {
  test(`HTTP deleteMany rolls back transformed selection and redo history after ${failure} failure`, async ({ page, request }) => {
    await ready(page, request)
    const nodes = await command(request, 'createMany', { specs, options: { select: true } })
    await inspectBoard(page, 'transform-selection')
    await command(request, 'create', { spec: { type: 'circle', radius: 15, left: 900, top: 500 } })
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await observe(request)).objects.length).toBe(3)
    const before = await observe(request)
    const history = await inspectBoard(page)
    await inspectBoard(page, `fail-${failure}`)
    const response = await request.post('/__mathboard_agent/command', {
      data: { method: 'deleteMany', params: { ids: [nodes[2].id, nodes[0].id] } },
    })
    expect(response.status()).toBe(409)
    expect((await response.json()).error.code).toBe('board_commit_failed')
    await inspectBoard(page, `restore-${failure}`)
    expect(await observe(request)).toEqual(before)
    expect(await inspectBoard(page)).toEqual(history)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(async () => (await observe(request)).objects.length).toBe(4)
  })
}

test('empty clear and deleteMany retain Redo when the last creation was undone', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects).toEqual([])
  const history = await inspectBoard(page)
  expect(await command(request, 'clear')).toEqual([])
  expect(await command(request, 'deleteMany', { ids: [] })).toEqual([])
  expect(await inspectBoard(page)).toEqual(history)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(idsOf(nodes))
})

test('clear of transformed selected roots restores scene geometry with one Undo', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs, options: { select: true } })
  await inspectBoard(page, 'transform-selection')
  const before = await observe(request)
  const removed = await command(request, 'clear')
  expect(idsOf(removed)).toEqual(idsOf(nodes))
  expect((await observe(request)).objects).toEqual([])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(idsOf(nodes))
  const restored = await observe(request)
  for (let i = 0; i < nodes.length; i++) {
    expect(restored.objects[i].type).toBe(before.objects[i].type)
    for (const key of ['left', 'top', 'angle', 'scaleX', 'scaleY', 'skewX']) {
      expect(restored.objects[i][key]).toBeCloseTo(before.objects[i][key], 8)
    }
    expect(restored.objects[i].mathboardInkMode).toBe(before.objects[i].mathboardInkMode)
  }
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects).toEqual([])
})
