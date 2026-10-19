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

const prefix = '/__mathboard_agent/'
async function command(request, method, params = {}) {
  const response = await request.post(prefix + 'command', { data: { method, params } })
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()).result
}
async function ready(page, request) {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await (await request.get(prefix + 'health')).json()).browserConnected).toBe(true)
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
}

// Local tool adapter proof: tool names are discovered semantic methods, not new REST endpoints.
async function invokeDiscovered(request, help, tool, args, { approveMutation = false } = {}) {
  const descriptor = help.methods.find(m => m.method === tool)
  if (!descriptor) throw new Error('Unknown tool')
  for (const key of descriptor.paramsSchema.required) {
    if (!(key in args)) throw new Error(`Missing ${key}`)
  }
  if (descriptor.mutatesBoard && !approveMutation) throw new Error('Mutation needs approval')
  if (descriptor.requiresStable && !(await command(request, 'observe')).stable) throw new Error('Board is unstable')
  return command(request, descriptor.method, args)
}

test('help does not change transport state or advertise unrelated pending feature commands', async ({ request }) => {
  const healthBefore = await (await request.get(prefix + 'health')).json()
  const response = await request.get(prefix + 'help')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/json')
  const help = await response.json()
  expect(help.methods.map(m => m.method)).toEqual(['observe', 'create', 'createMany', 'update', 'delete', 'deleteMany', 'clear', 'group', 'measure', 'layout', 'screenshot'])
  expect(help.objectTypes).toEqual(['rect', 'circle', 'ellipse', 'line', 'path', 'text', 'formula', 'group'])
  expect(await (await request.get(prefix + 'help')).json()).toEqual(help)
  expect(await (await request.get(prefix + 'health')).json()).toEqual(healthBefore)
  const unsupported = await request.post(prefix + 'command', { data: { method: 'autoLayoutV2' } })
  expect(unsupported.status()).toBe(400)
  expect(help.methods.find(m => m.method === 'deleteMany').paramsSchema.properties.ids.uniqueItems).toBe(true)
  expect(help.methods.find(m => m.method === 'clear').mutatesBoard).toBe(true)
  const grouping = help.methods.find(m => m.method === 'group')
  expect(grouping.mutatesBoard).toBe(true)
  expect(grouping.requiresStable).toBe(true)
  expect(grouping.paramsSchema.properties.ids.minItems).toBe(2)
  expect(grouping.paramsSchema.properties.ids.uniqueItems).toBe(true)
})

test('local adapter discovers tools, guards mutation and preserves live scene selection and Redo during help', async ({ page, request }) => {
  await ready(page, request)
  const help = await (await request.get(prefix + 'help')).json()
  const tools = help.methods.map(m => ({ name: m.method, description: m.summary, parameters: m.paramsSchema }))
  expect(tools.find(t => t.name === 'create').parameters.required).toContain('spec')
  const baseline = await invokeDiscovered(request, help, 'observe', {})
  const template = help.methods.find(m => m.method === 'create').example.params
  await expect(invokeDiscovered(request, help, 'create', template)).rejects.toThrow('Mutation needs approval')
  expect(await command(request, 'observe')).toEqual(baseline)
  await expect(invokeDiscovered(request, help, 'create', {}, { approveMutation: true })).rejects.toThrow('Missing spec')
  const object = await invokeDiscovered(request, help, 'create', { ...template, options: { select: true } }, { approveMutation: true })
  const created = await command(request, 'observe')
  expect(created.objects[0].id).toBe(object.id)
  expect(created.selection.ids).toEqual([object.id])
  for (let i = 0; i < 3; i++) expect(await (await request.get(prefix + 'help')).json()).toEqual(help)
  expect(await command(request, 'observe')).toEqual(created)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(0)
  const undone = await command(request, 'observe')
  await request.get(prefix + 'help')
  expect(await command(request, 'observe')).toEqual(undone)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(o => o.id)).toEqual([object.id])

  // Every advertised branch executes through the same registry in the real browser.
  const batch = await command(request, 'createMany', help.methods.find(m => m.method === 'createMany').example.params)
  const formula = batch.find(o => o.type === 'formula')
  const updated = await command(request, 'update', { id: formula.id, patch: { latex: 'x=2' } })
  expect(updated.id).toBe(formula.id)
  expect(updated.latex).toBe('x=2')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  const observedFormula = (await command(request, 'observe')).objects.find(o => o.id === formula.id)
  const bounds = observedFormula.bounds
  await page.mouse.dblclick(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
  await expect(page.getByRole('heading', { name: 'Edit Formula (LaTeX)' })).toBeVisible()
  await expect(page.getByLabel('LaTeX Formula:')).toHaveValue('x=2')
  await page.getByRole('button', { name: 'Close formula editor' }).click()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const beforeCapture = await command(request, 'observe')
  const screenshotMethod = help.methods.find(item => item.method === 'screenshot')
  expect(screenshotMethod.mutatesBoard).toBe(false)
  expect(screenshotMethod.requiresStable).toBe(true)
  expect(screenshotMethod.paramsSchema.properties.target.oneOf.map(item => item.properties.kind.const))
    .toEqual(['sceneRect', 'objectIds', 'viewport'])
  const captured = await invokeDiscovered(request, help, 'screenshot',
    { target: { kind: 'objectIds', ids: [formula.id], padding: 16 } })
  expect(captured.mimeType).toBe('image/png')
  expect(captured.encoding).toBe('base64')
  expect(captured.widthPx).toBeGreaterThan(0)
  expect(captured.heightPx).toBeGreaterThan(0)
  expect(Buffer.from(captured.data, 'base64').subarray(0, 8))
    .toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(await command(request, 'observe')).toEqual(beforeCapture)
  const rejected = await request.post(prefix + 'command', { data: { method: 'update', params: { id: formula.id, patch: { fill: 'red' } } } })
  expect(rejected.status()).toBe(409)
  expect((await rejected.json()).error.code).toBe('invalid_object_patch')
  await command(request, 'delete', { id: object.id })
  expect((await command(request, 'observe')).objects.some(o => o.id === object.id)).toBe(false)
  const beforeBulk = (await command(request, 'observe')).objects.map(o => o.id)
  await expect(invokeDiscovered(request, help, 'deleteMany', { ids: beforeBulk }))
    .rejects.toThrow('Mutation needs approval')
  const removed = await invokeDiscovered(request, help, 'deleteMany',
    { ids: [...beforeBulk].reverse() }, { approveMutation: true })
  expect(removed.map(o => o.id)).toEqual(beforeBulk)
  expect((await command(request, 'observe')).objects).toHaveLength(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(o => o.id)).toEqual(beforeBulk)
  const beforeClear = await command(request, 'observe')
  await expect(invokeDiscovered(request, help, 'clear', {})).rejects.toThrow('Mutation needs approval')
  expect(await command(request, 'observe')).toEqual(beforeClear)
  const cleared = await invokeDiscovered(request, help, 'clear', {}, { approveMutation: true })
  expect(cleared.map(o => o.id)).toEqual(beforeBulk)
  expect((await command(request, 'observe')).objects).toHaveLength(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(o => o.id)).toEqual(beforeBulk)
  await expect(invokeDiscovered(request, help, 'group', { ids: beforeBulk }))
    .rejects.toThrow('Mutation needs approval')
  const grouped = await invokeDiscovered(request, help, 'group',
    { ids: [...beforeBulk].reverse(), options: { select: false } }, { approveMutation: true })
  expect(grouped.type).toBe('group')
  expect(grouped.objects.map(o => o.id)).toEqual(beforeBulk)
  expect((await command(request, 'observe')).objects.map(o => o.id)).toEqual([grouped.id])
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.map(o => o.id)).toEqual(beforeBulk)
  const unknown = await request.post(prefix + 'command', { data: { method: 'constructor' } })
  expect(unknown.status()).toBe(400)
})
