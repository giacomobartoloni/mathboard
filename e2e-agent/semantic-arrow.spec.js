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

test('atomic vectors include terminal heads, preserve fixed paint and restore through history and reload', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => (await command(request, 'observe')).stable).toBe(true)
  const nodes = await command(request, 'createMany', { specs: [
    { type: 'text', text: 'Directed vectors with atomic heads', left: 200, top: 130, fontSize: 28 },
    { type: 'arrow', x1: 200, y1: 240, x2: 500, y2: 240, stroke: '#1565c0', fill: '#ff8800', mathboardInkMode: 'fixed', headLength: 28, headWidth: 24 },
    { type: 'arrow', x1: 500, y1: 360, x2: 200, y2: 360 },
    { type: 'arrow', x1: 650, y1: 480, x2: 820, y2: 240, headLength: 24, headWidth: 20 },
    { type: 'group', left: 650, top: 520, objects: [
      { type: 'arrow', x1: 0, y1: 0, x2: 150, y2: 0 },
      { type: 'text', text: 'Grouped vector', left: 0, top: 30, fontSize: 20 },
    ] },
  ] })
  expect(nodes[1]).toMatchObject({ type: 'arrow', x2: 500, fill: '#ff8800', stroke: '#1565c0' })
  expect(nodes[2]).toMatchObject({ type: 'arrow', x2: 200, fill: '#000000', stroke: '#000000', mathboardInkMode: 'auto' })
  const state = await command(request, 'observe')
  expect(state.objects[1].bounds.width).toBeGreaterThanOrEqual(300)
  expect(state.objects[1].bounds.height).toBeGreaterThanOrEqual(24)
  await command(request, 'update', { id: nodes[2].id, patch: { angle: 15, scaleY: 1.2 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects[2].angle).toBe(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await command(request, 'observe')).objects[2].angle).toBe(15)
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) })
  const path = testInfo.outputPath('arrow-directed-vectors.png')
  await page.screenshot({ path, animations: 'disabled' })
  await testInfo.attach('directed vectors whole viewport', { path, contentType: 'image/png' })
  await page.evaluate(() => { document.querySelector('#app').__vue_app__._instance.proxy.boardTheme = 'dark' })
  await expect.poll(async () => (await command(request, 'observe')).objects[2].fill).toBe('#f5f5f5')
  const dark = await command(request, 'observe')
  expect(dark.objects[2].stroke).toBe('#f5f5f5')
  expect(dark.objects[1]).toMatchObject({ fill: '#ff8800', stroke: '#1565c0' })
  expect(dark.objects[4].objects[0]).toMatchObject({ type: 'arrow', fill: '#f5f5f5', stroke: '#f5f5f5' })
  await page.evaluate(async () => { await document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef.flushPersistence() })
  await page.reload()
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(5)
  const restored = await command(request, 'observe')
  expect(restored.objects.map(({ id }) => id)).toEqual(nodes.map(({ id }) => id))
  expect(restored.objects[1]).toMatchObject({ type: 'arrow', x1: 200, x2: 500, headLength: 28, headWidth: 24, fill: '#ff8800' })
  expect(restored.objects[2]).toMatchObject({ angle: 15, scaleY: 1.2 })
  await command(request, 'clear')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await command(request, 'observe')).objects.length).toBe(5)
  expect((await command(request, 'observe')).objects[4].objects[0].type).toBe('arrow')
})
