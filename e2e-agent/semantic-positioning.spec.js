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
  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body.ok, JSON.stringify(body.error)).toBe(true)
  return body.result
}
async function ready(page, request) {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'observe' } })
    return response.ok() && (await response.json()).result?.stable
  }).toBe(true)
}

test('HTTP derivation uses aligned scene origins, measured frame, and retained history', async ({ page, request }, testInfo) => {
  await ready(page, request)
  const specs = [
    { type: 'text', text: 'Completing the square', left: 180, top: 100, fontSize: 28 },
    { type: 'text', text: '1. Move the constant term', left: 180, top: 160, fontSize: 20 },
    { type: 'formula', latex: 'x^2+6x=7', left: 180, top: 200 },
    { type: 'text', text: '2. Add nine to each side', left: 180, top: 260, fontSize: 20 },
    { type: 'formula', latex: 'x^2+6x+9=16', left: 180, top: 300 },
    { type: 'text', text: '3. Factor the perfect square', left: 180, top: 360, fontSize: 20 },
    { type: 'formula', latex: '(x+3)^2=16', left: 180, top: 400 },
  ]
  const created = await command(request, 'createMany', { specs })
  let state = await command(request, 'observe')
  for (const node of state.objects) {
    expect(node.originX).toBe('left')
    expect(node.originY).toBe('top')
    expect(node.left).toBe(180)
    expect(node.bounds.left).toBeCloseTo(180)
  }
  const result = state.objects.at(-1)
  const frame = await command(request, 'create', { spec: {
    type: 'rect', left: result.bounds.left - 12, top: result.bounds.top - 12,
    width: result.bounds.width + 24, height: result.bounds.height + 24,
    fill: null, stroke: '#16803c', strokeWidth: 2, mathboardInkMode: 'fixed',
  } })
  state = await command(request, 'observe')
  const enclosing = state.objects.find((o) => o.id === frame.id)
  expect(enclosing.bounds.left).toBeLessThan(result.bounds.left)
  expect(enclosing.bounds.top).toBeLessThan(result.bounds.top)
  expect(enclosing.bounds.left + enclosing.bounds.width).toBeGreaterThan(result.bounds.left + result.bounds.width)
  expect(enclosing.bounds.top + enclosing.bounds.height).toBeGreaterThan(result.bounds.top + result.bounds.height)
  await page.screenshot({ path: testInfo.outputPath('derivation-default-origins.png'), fullPage: true })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(7)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(8)
  const changed = await command(request, 'update', { id: created[6].id, patch: { latex: '(x+3)^2=4^2', left: 200 } })
  expect(changed.originX).toBe('left')
  expect(changed.left).toBe(200)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.find((o) => o.id === created[6].id).latex).toBe('(x+3)^2=16')
  // Real runtime viewport changes must not rewrite semantic scene positions.
  await page.evaluate(() => {
    const root = document.querySelector('#app').__vue_app__._instance.proxy
    root.drawBoardRef.canvas.setViewportTransform([1.5, 0, 0, 1.5, 80, -40])
  })
  expect((await command(request, 'observe')).objects.find((o) => o.id === created[6].id).left).toBe(180)
})

test('missed initial editing exit recovers liveness without a reset API', async ({ page, request }) => {
  await ready(page, request)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  const box = await page.locator('canvas.upper-canvas').boundingBox()
  await page.mouse.click(box.x + 320, box.y + 220)
  await expect(page.locator('textarea').first()).toBeAttached()
  expect((await command(request, 'observe')).stable).toBe(false)
  const rejected = await request.post('/__mathboard_agent/command', { data: {
    method: 'create', params: { spec: { type: 'rect', width: 20, height: 20 } },
  } })
  expect(rejected.status()).toBe(409)
  // Simulate an interrupted editor that missed Fabric's editing:exited callback.
  // Access stays in the development browser test, with no production hooks.
  await page.evaluate(() => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    const text = board._uncommittedText
    if (!text?.isEditing) throw new Error('Expected initial text editing')
    text.off('editing:exited')
    text.isEditing = false
    text.hiddenTextarea?.remove()
    text.hiddenTextarea = null
  })
  expect((await command(request, 'observe')).stable).toBe(true)
  const node = await command(request, 'create', { spec: { type: 'rect', left: 500, top: 300, width: 20, height: 20 } })
  expect(node.originX).toBe('left')
})
