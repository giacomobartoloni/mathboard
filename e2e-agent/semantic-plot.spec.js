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
async function invoke(request, method, params = {}) {
  const response = await request.post(endpoint, { data: { method, params } })
  const payload = await response.json()
  return { status: response.status(), ...payload }
}
async function command(request, method, params = {}) {
  const result = await invoke(request, method, params)
  expect(result.status, JSON.stringify(result.error)).toBe(200)
  return result.result
}

test('public Plot discovery creates, edits and persists semantic source', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const help = await (await request.get('/__mathboard_agent/help')).json()
  expect(help.objectTypes).toContain('plot')
  const specimen = help.examplesByType.plot
  const graph = await command(request, 'create', { spec: {
    ...specimen,
    latex: '1/x',
    left: 260,
    top: 170,
  } })
  expect(graph.type).toBe('plot')
  expect(graph.latex).toBe('1/x')
  expect(['ok', 'partial']).toContain(graph.plotStatus)
  const full = (await command(request, 'observe', { detail: 'full' })).objects[0]
  expect(full.id).toBe(graph.id)
  expect(full.mathWindow).toEqual(specimen.mathWindow)
  expect(full.frame).toEqual(specimen.frame)
  expect(full.plotStatus).toBe(graph.plotStatus)
  const summary = (await command(request, 'observe', { detail: 'summary' })).objects[0]
  expect(summary.mathWindow).toBeUndefined()
  expect(summary.latex).toBe('1/x')
  const edited = await command(request, 'update', { id: graph.id, patch: {
    latex: '\\sin(x)', grid: false, border: false, axisNumbers: false,
    color: '#2563eb', mathWindow: { xMin: -3, xMax: 3, yMin: -2, yMax: 2 },
  } })
  expect(edited.id).toBe(graph.id)
  expect(edited).toMatchObject({
    latex: '\\sin(x)', grid: false, border: false, axisNumbers: false, color: '#2563eb',
  })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () =>
    (await command(request, 'observe', { detail: 'full' })).objects[0]?.latex).toBe('1/x')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () =>
    (await command(request, 'observe', { detail: 'full' })).objects[0]?.latex).toBe('\\sin(x)')
  await page.evaluate(async () => {
    await document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef.flushPersistence()
  })
  await page.reload()
  await expect.poll(async () =>
    (await command(request, 'observe', { detail: 'full' })).objects[0]?.id).toBe(graph.id)
  const persisted = (await command(request, 'observe', { detail: 'full' })).objects[0]
  expect(persisted).toMatchObject({ border: false, axisNumbers: false, grid: false })
  expect(persisted.mathWindow).toEqual({ xMin: -3, xMax: 3, yMin: -2, yMax: 2 })
})

test('public Plot boundaries reject malformed creates/patches and preserve the board', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const help = await (await request.get('/__mathboard_agent/help')).json()
  const plot = help.examplesByType.plot
  const before = await command(request, 'observe')
  for (const spec of [
    { ...plot, fill: '#ffffff' }, { ...plot, plotStatus: 'ok' },
    { ...plot, mathWindow: { xMin: -3 } },
  ]) {
    const failure = await invoke(request, 'create', { spec })
    expect(failure.status).toBe(409)
    expect(failure.error.code).toBe('invalid_object_spec')
  }
  const added = await command(request, 'create', { spec: plot })
  const badPatch = await invoke(request, 'update', { id: added.id, patch: { mathWindow: { xMin: -2 } } })
  expect(badPatch.status).toBe(409)
  expect(badPatch.error.code).toBe('invalid_object_patch')
  const rejected = await invoke(request, 'createMany', { specs: [
    { type: 'rect', width: 40, height: 50 },
    { ...plot, latex: '\\sqrt{-1}' },
  ] })
  expect(rejected.status).toBe(409)
  expect(rejected.error.code).toBe('plot_no_real_samples')
  const observed = await command(request, 'observe')
  expect(observed.objects).toHaveLength(before.objects.length + 1)
  expect(observed.objects.at(-1).id).toBe(added.id)
})

test('Plot screenshot captures rendered geometry at root, nested and after reload', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const help = await (await request.get('/__mathboard_agent/help')).json()
  const spec = { ...help.examplesByType.plot, latex: '1/x', left: 320, top: 220 }
  const graph = await command(request, 'create', { spec })
  const png = image => {
    expect(image.mimeType).toBe('image/png')
    expect(image.encoding).toBe('base64')
    expect(image.widthPx).toBeGreaterThan(0)
    expect(image.heightPx).toBeGreaterThan(0)
    expect(Buffer.from(image.data, 'base64').subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  }

  const viewport = await command(request, 'screenshot', { target: { kind: 'viewport' } })
  png(viewport)
  const before = await command(request, 'screenshot', {
    target: { kind: 'objectIds', ids: [graph.id], padding: 20 },
  })
  png(before)
  png(await command(request, 'screenshot', {
    target: { kind: 'sceneRect', rect: { x: 280, y: 180, width: 580, height: 400 } },
  }))

  await command(request, 'update', { id: graph.id, patch: {
    latex: 'x^2', color: '#2563eb', grid: false, border: false,
  } })
  const after = await command(request, 'screenshot', {
    target: { kind: 'objectIds', ids: [graph.id], padding: 20 },
  })
  png(after)
  expect(after.data).not.toBe(before.data)

  const group = await command(request, 'create', { spec: {
    type: 'group', left: 190, top: 100, angle: 17,
    objects: [
      { ...spec, latex: 'x^3', left: 0, top: 0 },
      { type: 'rect', left: 500, top: 0, width: 40, height: 30 },
    ],
  } })
  const nested = await command(request, 'screenshot', {
    target: { kind: 'objectIds', ids: [group.id], padding: 12 },
  })
  png(nested)
  expect((await command(request, 'observe', { detail: 'full' })).objects[1].objects[0].type).toBe('plot')
  await page.evaluate(async () => {
    await document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef.flushPersistence()
  })
  await page.reload()
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(2)
  png(await command(request, 'screenshot', { target: { kind: 'viewport' } }))
  png(await command(request, 'screenshot', { target: { kind: 'objectIds', ids: [group.id] } }))
})
