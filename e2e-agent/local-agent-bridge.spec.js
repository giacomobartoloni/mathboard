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

const healthUrl = '/__mathboard_agent/health'
const commandUrl = '/__mathboard_agent/command'

async function sendCommand(request, method, params = {}) {
  const response = await request.post(commandUrl, { data: { method, params } })
  expect(response.status(), `${method} should return HTTP 200`).toBe(200)
  const body = await response.json()
  expect(body.ok, `${method} should succeed: ${JSON.stringify(body.error)}`).toBe(true)
  return body.result
}

async function observe(request) {
  return sendCommand(request, 'observe')
}

test('local agent HTTP bridge controls the live MathBoard', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await page.waitForFunction(() => Boolean(document.querySelector('canvas.upper-canvas')))

  await expect.poll(async () => {
    const response = await request.get(healthUrl)
    expect(response.ok()).toBe(true)
    return (await response.json()).browserConnected
  }).toBe(true)

  await expect.poll(async () => {
    const response = await request.post(commandUrl, {
      data: { method: 'observe', params: {} },
    })
    return response.ok() && (await response.json()).result?.stable === true
  }).toBe(true)

  const empty = await observe(request)
  expect(empty.stable).toBe(true)
  expect(empty.objects).toEqual([])

  const created = await sendCommand(request, 'createMany', {
    specs: [
      { type: 'text', text: 'Equation', left: 300, top: 160 },
      { type: 'formula', latex: 'x=1', left: 320, top: 240 },
      { type: 'rect', left: 500, top: 160, width: 80, height: 60, fill: null },
    ],
  })
  expect(created).toHaveLength(3)
  expect(created.map((object) => object.type)).toEqual(['text', 'formula', 'rect'])
  const ids = created.map((object) => object.id)
  expect(new Set(ids).size).toBe(3)

  let state = await observe(request)
  expect(state.objects.map((object) => object.id)).toEqual(ids)
  expect(state.objects[1].latex).toBe('x=1')
  expect(state.objects[1].objects).toBeUndefined()

  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await observe(request)).objects).toHaveLength(0)

  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await observe(request)).objects.map((object) => object.id)).toEqual(ids)

  const formula = await sendCommand(request, 'update', {
    id: ids[1],
    patch: { latex: 'x=2' },
  })
  expect(formula.id).toBe(ids[1])
  expect(formula.latex).toBe('x=2')
  state = await observe(request)
  expect(state.objects.find((object) => object.id === ids[1]).latex).toBe('x=2')

  const deleted = await sendCommand(request, 'delete', { id: ids[2] })
  expect(deleted.id).toBe(ids[2])
  state = await observe(request)
  expect(state.objects).toHaveLength(2)
  expect(state.objects.some((object) => object.id === ids[2])).toBe(false)

  const missing = await request.post(commandUrl, {
    data: { method: 'delete', params: { id: ids[2] } },
  })
  expect(missing.status()).toBe(409)
  expect((await missing.json()).error.code).toBe('object_not_found')

  const finalObject = await sendCommand(request, 'create', {
    spec: { type: 'rect', left: 620, top: 180, width: 40, height: 40, fill: null },
  })
  expect(finalObject.type).toBe('rect')
  state = await observe(request)
  expect(state.objects).toHaveLength(3)
  expect(state.objects.some((object) => object.id === finalObject.id)).toBe(true)
})
