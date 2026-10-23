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
  return body.result
}
const observe = (request) => command(request, 'observe')

async function inspect(page, action) {
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
    if (action === 'flush') await board.flushPersistence()
    if (action === 'fail-history') {
      board._originalNotify = board._notifyDocumentChanged
      board._notifyDocumentChanged = () => { throw new Error('Injected style history failure') }
    }
    if (action === 'restore-history') board._notifyDocumentChanged = board._originalNotify
    if (action === 'transform-selection') {
      board.canvas.getActiveObject().set({ left: 550, top: 350, angle: 25, scaleX: 1.2, scaleY: 0.8 })
      board.canvas.getActiveObject().setCoords()
    }
    const read = (object) => ({ id: object.mathboardId, fill: object.fill, stroke: object.stroke,
      opacity: object.opacity, mode: object.mathboardInkMode, dash: object.strokeDashArray,
      children: object.getObjects?.().map(read) })
    return { history: { length: board._boardHistory.summary().length, step: board._boardHistory.summary().step }, objects: board.canvas.getObjects().map(read) }
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

function leafPaints(object) {
  return object.children?.length ? object.children.flatMap(leafPaints) : [object.fill, object.stroke].filter((paint) => paint && !['none', 'transparent'].includes(paint))
}

for (const type of ['rect', 'text', 'formula']) {
  test(`${type} Undo resolves AUTO in current dark theme and Redo restores exact FIXED paint`, async ({ page, request }) => {
    await ready(page, request)
    const spec = type === 'rect' ? { type, width: 100, height: 70, fill: null }
      : type === 'text' ? { type, text: 'Automatic ink', fontSize: 30 }
        : { type, latex: String.raw`\frac{x^2+1}{2}` }
    const node = await command(request, 'create', { spec: { ...spec, left: 350, top: 200 } })
    const paintKey = type === 'rect' ? 'stroke' : 'fill'
    await command(request, 'update', { id: node.id, patch: { [paintKey]: '#c92a2a', opacity: 0.8 } })
    const beforeTheme = await inspect(page)
    await page.getByRole('button', { name: /Theme:/ }).click()
    expect((await inspect(page)).history).toEqual(beforeTheme.history)
    expect((await observe(request)).objects[0][paintKey]).toBe('#c92a2a')
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await observe(request)).objects[0].mathboardInkMode).toBe('auto')
    expect((await observe(request)).objects[0][paintKey]).toBe('#f5f5f5')
    if (type === 'formula') expect(new Set(leafPaints((await inspect(page)).objects[0]))).toEqual(new Set(['#f5f5f5']))
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(async () => (await observe(request)).objects[0][paintKey]).toBe('#c92a2a')
    if (type === 'formula') expect(new Set(leafPaints((await inspect(page)).objects[0]))).toEqual(new Set(['#c92a2a']))
    await command(request, 'update', { id: node.id, patch: { mathboardInkMode: 'auto' } })
    expect((await observe(request)).objects[0][paintKey]).toBe('#f5f5f5')
    if (type === 'formula') expect(new Set(leafPaints((await inspect(page)).objects[0]))).toEqual(new Set(['#f5f5f5']))
  })
}

test('styles remain undoable and persistent; formula canonical ink agrees with painted vectors', async ({ page, request }, testInfo) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'rect', left: 300, top: 210, width: 150, height: 100, fill: null },
    { type: 'text', text: 'History-safe styles', left: 300, top: 130, fontSize: 30 },
    { type: 'formula', latex: 'x=1', left: 510, top: 220, fill: '#1864ab', mathboardInkMode: 'fixed' },
  ] })
  const patch = { stroke: '#2f9e44', fill: null, strokeWidth: 5, strokeDashArray: [12, 5], strokeLineCap: 'round', strokeLineJoin: 'bevel', opacity: 0.65 }
  await command(request, 'update', { id: nodes[0].id, patch })
  expect((await observe(request)).objects[0]).toMatchObject({ ...patch, mathboardInkMode: 'fixed' })
  const beforeFormula = await inspect(page)
  await command(request, 'update', { id: nodes[2].id, patch: { stroke: '#c92a2a', latex: String.raw`\frac{x^2+1}{2}`, opacity: 0.8 } })
  expect((await inspect(page)).history.length).toBe(beforeFormula.history.length + 1)
  expect((await observe(request)).objects[2]).toMatchObject({ fill: '#c92a2a', opacity: 0.8, mathboardInkMode: 'fixed' })
  expect(new Set(leafPaints((await inspect(page)).objects[2]))).toEqual(new Set(['#c92a2a']))
  await page.screenshot({ path: testInfo.outputPath('f020-styles-light.png') })
  await page.getByRole('button', { name: /Theme:/ }).click()
  await expect.poll(async () => (await observe(request)).objects[1].fill).toBe('#f5f5f5')
  await page.screenshot({ path: testInfo.outputPath('f020-styles-dark.png') })
  await inspect(page, 'flush')
  await page.reload()
  await expect.poll(async () => (await observe(request)).objects.length).toBe(3)
  expect((await observe(request)).objects[0]).toMatchObject({ ...patch, mathboardInkMode: 'fixed' })
  expect(new Set(leafPaints((await inspect(page)).objects[2]))).toEqual(new Set(['#c92a2a']))
  await command(request, 'update', { id: nodes[2].id, patch: { mathboardInkMode: 'auto' } })
  expect((await observe(request)).objects[2].fill).toBe('#f5f5f5')
  expect(new Set(leafPaints((await inspect(page)).objects[2]))).toEqual(new Set(['#f5f5f5']))
  await page.screenshot({ path: testInfo.outputPath('f020-styles-auto-dark.png') })
})

test('null and transparent primitive surfaces survive AUTO mode and theme replay', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'circle', radius: 30, left: 350, top: 220 },
    { type: 'text', text: 'No paint', left: 500, top: 220 },
  ] })
  await command(request, 'update', { id: nodes[0].id, patch: { stroke: null, fill: 'none', mathboardInkMode: 'auto' } })
  await command(request, 'update', { id: nodes[1].id, patch: { fill: 'transparent', mathboardInkMode: 'auto' } })
  await page.getByRole('button', { name: /Theme:/ }).click()
  expect((await observe(request)).objects[0]).toMatchObject({ stroke: null, fill: 'none' })
  expect((await observe(request)).objects[1].fill).toBe('transparent')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects[1].fill).toBe('#f5f5f5')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects[1].fill).toBe('transparent')
})

test('failed style history commit restores semantic styles, actual formula paint and redo tail', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'rect', left: 320, top: 200, width: 100, height: 70, fill: null },
    { type: 'formula', latex: 'x=1', left: 500, top: 220, fill: '#1864ab', mathboardInkMode: 'fixed' },
  ] })
  await command(request, 'create', { spec: { type: 'circle', radius: 20 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(2)
  const before = await observe(request)
  const painted = await inspect(page)
  for (const [id, patch] of [[nodes[0].id, { stroke: '#c92a2a', fill: '#ff0', opacity: 0.4, strokeDashArray: [8, 3], strokeWidth: 4, strokeLineCap: 'round', strokeLineJoin: 'bevel' }],
    [nodes[1].id, { stroke: '#c92a2a', latex: 'x=2', opacity: 0.5 }]]) {
    await inspect(page, 'fail-history')
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'update', params: { id, patch } } })
    expect(response.status()).toBe(409)
    expect((await response.json()).error.code).toBe('board_commit_failed')
    await inspect(page, 'restore-history')
    expect(await observe(request)).toEqual(before)
    expect(await inspect(page)).toEqual(painted)
  }
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(3)
})

test('selected style patches preserve scene geometry and Group opacity never recolors children', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'rect', left: 320, top: 200, width: 90, height: 60, fill: null },
    { type: 'formula', latex: 'x=1', left: 510, top: 220 },
    { type: 'group', left: 700, top: 300, objects: [
      { type: 'circle', radius: 20, stroke: '#1864ab', fill: null, mathboardInkMode: 'fixed' },
      { type: 'text', text: 'Group child', left: 80, fill: '#c92a2a', mathboardInkMode: 'fixed' },
    ] },
  ], options: { select: true } })
  await inspect(page, 'transform-selection')
  const before = await observe(request)
  await command(request, 'update', { id: nodes[0].id, patch: { stroke: '#2f9e44', opacity: 0.7, strokeDashArray: [7, 4] } })
  const after = await observe(request)
  for (let i = 0; i < nodes.length; i++) {
    for (const key of ['left', 'top', 'angle', 'scaleX', 'scaleY']) expect(after.objects[i][key]).toBeCloseTo(before.objects[i][key], 8)
  }
  const children = after.objects[2].objects
  const painted = (await inspect(page)).objects[2].children
  await command(request, 'update', { id: nodes[2].id, patch: { opacity: 0.4 } })
  expect((await observe(request)).objects[2].objects).toEqual(children)
  expect((await inspect(page)).objects[2].children).toEqual(painted)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects[2].opacity).toBe(1)
  expect((await inspect(page)).objects[2].children).toEqual(painted)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects[2].opacity).toBe(0.4)
})

test('no-op style updates preserve redo including formula paint canonicalization', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'rect', width: 90, height: 60, stroke: '#1864ab', fill: null, mathboardInkMode: 'fixed' },
    { type: 'formula', latex: 'x=1', left: 400, top: 200, fill: '#1864ab', mathboardInkMode: 'fixed' },
  ] })
  await command(request, 'create', { spec: { type: 'circle', radius: 20 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(2)
  const before = await inspect(page)
  await command(request, 'update', { id: nodes[0].id, patch: { stroke: '#1864ab', fill: null } })
  await command(request, 'update', { id: nodes[1].id, patch: { stroke: '#1864ab' } })
  expect(await inspect(page)).toEqual(before)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(3)
})

test('formula paint ignored by explicit AUTO is an effective no-op and preserves redo', async ({ page, request }) => {
  await ready(page, request)
  const node = await command(request, 'create', { spec: { type: 'formula', latex: 'x=1', left: 400, top: 220 } })
  await command(request, 'create', { spec: { type: 'circle', radius: 20 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(1)
  const before = await inspect(page)
  await command(request, 'update', { id: node.id, patch: { fill: '#c92a2a', mathboardInkMode: 'auto' } })
  expect(await inspect(page)).toEqual(before)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects.length).toBe(2)
})

test('F019 semantic ellipse polygon and arrow retain history-safe style across themes and persistence', async ({ page, request }) => {
  await ready(page, request)
  const specs = [
    { type: 'ellipse', rx: 65, ry: 35, left: 180, top: 170, fill: null },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 80 }],
      left: 390, top: 170, fill: null },
    { type: 'arrow', x1: 550, y1: 220, x2: 790, y2: 220, headLength: 22, headWidth: 16 },
  ]
  const nodes = await command(request, 'createMany', { specs })
  for (const node of nodes) {
    await command(request, 'update', { id: node.id,
      patch: { stroke: '#2f9e44', strokeWidth: 4, opacity: 0.75, mathboardInkMode: 'fixed' } })
  }
  expect((await observe(request)).objects).toHaveLength(3)
  for (const object of (await observe(request)).objects) {
    expect(object).toMatchObject({ stroke: '#2f9e44', strokeWidth: 4,
      opacity: 0.75, mathboardInkMode: 'fixed' })
  }
  await page.getByRole('button', { name: /Theme:/ }).click()
  for (const object of (await observe(request)).objects) {
    expect(object.stroke).toBe('#2f9e44')
  }
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects[2].mathboardInkMode).toBe('auto')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects[2].stroke).toBe('#2f9e44')
  await inspect(page, 'flush')
  await page.reload()
  await expect.poll(async () => (await observe(request)).objects.length).toBe(3)
  for (const object of (await observe(request)).objects) {
    expect(object).toMatchObject({ stroke: '#2f9e44', opacity: 0.75, mathboardInkMode: 'fixed' })
  }
})
