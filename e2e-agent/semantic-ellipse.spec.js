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
async function boardAction(page, action) {
  return page.evaluate(async (action) => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    if (action === 'dark') board.$parent.boardTheme = 'dark'
    if (action === 'flush') await board.flushPersistence()
    return board.canvas.getObjects().map((object) => ({ fill: object.fill, stroke: object.stroke }))
  }, action)
}

test('semantic ellipses render a Venn diagram, retain history and persist across reload', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'ellipse', rx: 140, ry: 95, left: 200, top: 220, fill: '#cce5ff', stroke: '#1565c0', mathboardInkMode: 'fixed', opacity: 0.65 },
    { type: 'ellipse', rx: 140, ry: 95, left: 380, top: 220, fill: '#ffccdd', stroke: '#ad1457', mathboardInkMode: 'fixed', opacity: 0.65 },
    { type: 'ellipse', rx: 45, ry: 80, left: 750, top: 210, fill: null, stroke: '#123456', mathboardInkMode: 'auto' },
    { type: 'text', text: 'Venn diagram: A and B', left: 200, top: 150, fontSize: 26 },
  ] })
  expect(nodes[0]).toMatchObject({ type: 'ellipse', rx: 140, ry: 95, fill: '#cce5ff' })
  expect(nodes[2]).toMatchObject({ stroke: '#000000', fill: null, mathboardInkMode: 'auto' })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(4)
  const moved = await command(request, 'update', { id: nodes[2].id, patch: { angle: 25, scaleX: 1.2 } })
  expect(moved.rx).toBe(45)
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) })
  const path = testInfo.outputPath('ellipse-venn-light.png')
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach('ellipse Venn whole viewport', { path, contentType: 'image/png' })
  await page.evaluate(() => { document.querySelector('#app').__vue_app__._instance.proxy.boardTheme = 'dark' })
  await expect.poll(async () => (await command(request, 'observe')).objects[2].stroke).toBe('#f5f5f5')
  const dark = await command(request, 'observe')
  expect(dark.objects[0].fill).toBe('#cce5ff')
  expect(dark.objects[2].fill).toBeNull()
  await boardAction(page, 'flush')
  await page.reload()
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(4)
  const restored = await command(request, 'observe')
  expect(restored.objects.map(({ id }) => id)).toEqual(nodes.map(({ id }) => id))
  expect(restored.objects[2]).toMatchObject({ rx: 45, ry: 80, angle: 25, scaleX: 1.2 })
})
