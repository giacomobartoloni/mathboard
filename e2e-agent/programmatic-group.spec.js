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
const idsOf = (objects) => objects.map((o) => o.id)
async function ready(page, request) {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'observe' } })
    return response.ok() && (await response.json()).result?.stable
  }).toBe(true)
}
async function runtime(page, action) {
  return page.evaluate(async (action) => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    const canvas = board.canvas
    if (action === 'remember') board._groupTestRoots = canvas.getObjects()
    if (action === 'remember-group') board._groupTestComposite = canvas.getObjects().at(-1)
    if (action === 'transform-selection') {
      const active = canvas.getActiveObject()
      active.set({ angle: 17, scaleX: 1.3, scaleY: 0.8, skewX: 8, left: 450 })
      active.setCoords()
    }
    if (action === 'flush') await board.flushPersistence()
    if (action === 'fail-notify') {
      board._groupTestNotify = board._notifyDocumentChanged
      board._notifyDocumentChanged = () => { throw new Error('Injected group history notification failure') }
    }
    if (action === 'restore-notify') board._notifyDocumentChanged = board._groupTestNotify
    const active = canvas.getActiveObject()
    const flatten = (objects) => objects.flatMap((o) => board._boardObjectPolicy.isBoardGroup(o) ? flatten(o.getObjects()) : [o])
    return {
      ids: canvas.getObjects().map((o) => o.mathboardId),
      matrices: flatten(canvas.getObjects()).map((o) => ({ id: o.mathboardId, matrix: o.calcTransformMatrix(),
        endpoints: o.isType('Line') ? [o.x1, o.y1, o.x2, o.y2] : null,
        paints: board._boardObjectPolicy.isFormula(o) ? o.getObjects().flatMap((p) => [p.fill, p.stroke]).filter(Boolean) : [o.stroke],
      })),
      retained: board._groupTestRoots?.every((o) => flatten(canvas.getObjects()).includes(o)),
      sameGroup: board._groupTestComposite ? canvas.getObjects().includes(board._groupTestComposite) : null,
      history: board._boardHistory._entries.map((o) => o.type), step: board._boardHistory.summary().step, tip: board._boardHistory._tipKind,
      selection: canvas.getActiveObjects().map((o) => o.mathboardId),
      selectionMatrix: active?.calcTransformMatrix(),
    }
  }, action)
}
function expectGeometry(actual, expected) {
  expect(actual.map((o) => o.id)).toEqual(expected.map((o) => o.id))
  actual.forEach((o, index) => {
    o.matrix.forEach((value, i) => expect(value).toBeCloseTo(expected[index].matrix[i], 7))
    expect(o.endpoints).toEqual(expected[index].endpoints)
  })
}
const diagram = [
  { type: 'line', x1: 240, y1: 400, x2: 240, y2: 200, strokeWidth: 2 },
  { type: 'line', x1: 240, y1: 400, x2: 520, y2: 400, strokeWidth: 2 },
  { type: 'line', x1: 240, y1: 200, x2: 520, y2: 400, strokeWidth: 2 },
  { type: 'formula', latex: 'a', left: 210, top: 280 },
  { type: 'formula', latex: 'b', left: 370, top: 420 },
  { type: 'formula', latex: 'c', left: 400, top: 270, fill: '#1864ab', mathboardInkMode: 'fixed' },
]

test('HTTP triangle groups retained labels, moves/replays, persists, follows themes and ungroups for formula editing', async ({ page, request }, testInfo) => {
  await ready(page, request)
  const help = await (await request.get('/__mathboard_agent/help')).json()
  const grouping = help.methods.find(method => method.method === 'group')
  expect(grouping).toBeTruthy()
  expect(grouping.mutatesBoard).toBe(true)
  expect(grouping.requiresStable).toBe(true)
  expect(grouping.paramsSchema.properties.ids.minItems).toBe(2)
  expect(grouping.paramsSchema.properties.ids.uniqueItems).toBe(true)
  expect(help.methods.find(method => method.method === 'screenshot').mutatesBoard).toBe(false)
  const nodes = await command(request, 'createMany', { specs: diagram })
  const before = await runtime(page, 'remember')
  const grouped = await command(request, 'group', { ids: idsOf(nodes).reverse(), options: { select: true } })
  expect(grouped.type).toBe('group')
  expect(idsOf(grouped.objects)).toEqual(idsOf(nodes))
  expect(grouped.objects.filter((o) => o.type === 'formula')).toHaveLength(3)
  expect((await runtime(page, 'remember-group')).retained).toBe(true)
  expectGeometry((await runtime(page)).matrices, before.matrices)
  await page.mouse.click(700, 200)
  await page.screenshot({ path: testInfo.outputPath('triangle-grouped.png'), fullPage: true })
  const patch = { left: grouped.left + 70, top: grouped.top + 30, angle: 15, scaleX: 1.2, scaleY: 0.9 }
  await command(request, 'update', { id: grouped.id, patch })
  const moved = await runtime(page)
  expect(moved.matrices[0].matrix).not.toEqual(before.matrices[0].matrix)
  await page.keyboard.press('ControlOrMeta+z')
  expectGeometry((await runtime(page)).matrices, before.matrices)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  expectGeometry((await runtime(page)).matrices, moved.matrices)
  await page.keyboard.press('ControlOrMeta+z')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(idsOf(nodes))
  expectGeometry((await runtime(page)).matrices, before.matrices)
  expect((await runtime(page)).retained).toBe(true)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual([grouped.id])
  expect((await runtime(page)).sameGroup).toBe(true)
  expectGeometry((await runtime(page)).matrices, before.matrices)

  await page.getByRole('button', { name: /Theme:/ }).click()
  const dark = await runtime(page)
  expect(dark.matrices[0].paints).toEqual(['#f5f5f5'])
  expect(dark.matrices[3].paints.every((p) => p === '#f5f5f5')).toBe(true)
  expect(dark.matrices[5].paints.every((p) => p === '#1864ab')).toBe(true)
  await runtime(page, 'flush')
  await page.reload()
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual([grouped.id])
  const restored = (await observe(request)).objects[0]
  expect(idsOf(restored.objects)).toEqual(idsOf(nodes))
  expectGeometry((await runtime(page)).matrices, before.matrices)
  expect(restored.objects[5].mathboardInkMode).toBe('fixed')
  expect((await runtime(page)).history).toEqual([])
  const nested = await request.post('/__mathboard_agent/command', { data: { method: 'update', params: {
    id: nodes[5].id, patch: { latex: 'c=5' },
  } } })
  expect(nested.status()).toBe(409)
  expect((await nested.json()).error.code).toBe('nested_object_mutation_not_supported')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(idsOf(nodes))
  await page.mouse.click(700, 180)
  const formula = (await observe(request)).objects.find((o) => o.id === nodes[5].id)
  await page.mouse.dblclick(formula.bounds.left + formula.bounds.width / 2, formula.bounds.top + formula.bounds.height / 2)
  const input = page.getByLabel('LaTeX Formula:')
  await expect(input).toHaveValue('c')
  await input.fill('c=5')
  await page.getByRole('button', { name: 'Update', exact: true }).click()
  await expect.poll(async () => (await observe(request)).objects.find((o) => o.id === nodes[5].id)?.latex).toBe('c=5')
})

test('HTTP group rejects malformed and nested IDs before mutation', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [diagram[0], diagram[3], { type: 'group', objects: [diagram[4]] }] })
  const before = await observe(request)
  const history = await runtime(page)
  for (const [ids, code] of [
    [[], 'invalid_object_spec'], [[nodes[0].id], 'invalid_object_spec'],
    [[nodes[0].id, nodes[0].id], 'invalid_object_spec'], [[nodes[0].id, 'missing'], 'object_not_found'],
    [[nodes[0].id, nodes[2].id], 'invalid_object_spec'],
    [[nodes[0].id, nodes[2].objects[0].id], 'nested_object_mutation_not_supported'],
  ]) {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'group', params: { ids } } })
    expect(response.status()).toBe(409)
    expect((await response.json()).error.code).toBe(code)
    expect(await observe(request)).toEqual(before)
    expect(await runtime(page)).toEqual(history)
  }
})

test('HTTP group history failure restores transformed partial selection and existing redo tail', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: diagram, options: { select: true } })
  await runtime(page, 'transform-selection')
  await command(request, 'create', { spec: { type: 'rect', width: 30, height: 20, left: 700, top: 300 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(6)
  const before = await observe(request)
  const history = await runtime(page, 'remember')
  await runtime(page, 'fail-notify')
  const response = await request.post('/__mathboard_agent/command', { data: { method: 'group', params: { ids: [nodes[3].id, nodes[0].id], options: { select: true } } } })
  expect(response.status()).toBe(409)
  expect((await response.json()).error.code).toBe('board_commit_failed')
  await runtime(page, 'restore-notify')
  expect(await observe(request)).toEqual(before)
  expect(await runtime(page)).toEqual(history)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(7)
})


test('HTTP grouping noncontiguous transformed members preserves all scene geometry and restores original z-order', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: diagram, options: { select: true } })
  await runtime(page, 'transform-selection')
  const before = await runtime(page, 'remember')
  const grouped = await command(request, 'group', { ids: [nodes[5].id, nodes[0].id, nodes[3].id] })
  expect(idsOf(grouped.objects)).toEqual([nodes[0].id, nodes[3].id, nodes[5].id])
  expect(idsOf((await observe(request)).objects)).toEqual([nodes[1].id, nodes[2].id, nodes[4].id, grouped.id])
  const byId = new Map(before.matrices.map((o) => [o.id, o]))
  const after = await runtime(page, 'remember-group')
  expect(after.selection).toEqual([])
  expectGeometry(after.matrices, after.matrices.map((o) => byId.get(o.id)))
  expect(after.retained).toBe(true)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => idsOf((await observe(request)).objects)).toEqual(idsOf(nodes))
  expectGeometry((await runtime(page)).matrices, before.matrices)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await runtime(page)).sameGroup).toBe(true)
  expectGeometry((await runtime(page)).matrices, after.matrices)
})
