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

test('filled polygons preserve area paint, transformed geometry and history across reload', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const points = [{ x: -20, y: 10 }, { x: 280, y: 10 }, { x: -20, y: 230 }]
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'text', text: 'A filled right triangle', left: 200, top: 130, fontSize: 28 },
    { type: 'polygon', points, left: 240, top: 240, strokeWidth: 3, stroke: '#1565c0', fill: '#fff0aa', mathboardInkMode: 'fixed' },
    { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 80 }], left: 740, top: 230, fill: '#abcdef', stroke: '#123456' },
    { type: 'formula', latex: 'A=\\frac{1}{2}bh', left: 240, top: 510 },
  ] })
  expect(nodes[1].points).toEqual(points)
  expect(nodes[1]).toMatchObject({ fill: '#fff0aa', stroke: '#1565c0' })
  expect(nodes[2]).toMatchObject({ fill: '#000000', stroke: '#000000', mathboardInkMode: 'auto' })
  await command(request, 'update', { id: nodes[2].id, patch: { angle: 20, scaleY: 1.2 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects[2].angle).toBe(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects[2].angle).toBe(20)
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) })
  const path = testInfo.outputPath('polygon-filled-triangle.png')
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach('filled triangle whole viewport', { path, contentType: 'image/png' })
  await page.evaluate(() => { document.querySelector('#app').__vue_app__._instance.proxy.boardTheme = 'dark' })
  await expect.poll(async () => (await command(request, 'observe')).objects[2].fill).toBe('#f5f5f5')
  const dark = await command(request, 'observe')
  expect(dark.objects[2].stroke).toBe('#f5f5f5')
  expect(dark.objects[1]).toMatchObject({ fill: '#fff0aa', stroke: '#1565c0' })
  await page.evaluate(async () => { await document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef.flushPersistence() })
  await page.reload()
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(4)
  const restored = await command(request, 'observe')
  expect(restored.objects.map(({ id }) => id)).toEqual(nodes.map(({ id }) => id))
  expect(restored.objects[1]).toMatchObject({ points, fill: '#fff0aa', stroke: '#1565c0' })
  expect(restored.objects[2]).toMatchObject({ angle: 20, scaleY: 1.2 })
})
