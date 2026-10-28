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

import { test, expect } from '@playwright/test'
import { seedBoardStorage } from '../e2e/fixtures.js'
test.use({ viewport: { width: 1280, height: 800 } })
async function send(request, method, params = {}) {
  const response = await request.post('/__mathboard_agent/command', { data: { method, params } })
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(200)
  return body.result
}
async function ready(page, request) {
  await seedBoardStorage(page)
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'observe' } })
    return response.ok() && (await response.json()).result.stable
  }).toBe(true)
}
const derivation = [
  { type: 'text', text: 'Completing the square', fontSize: 30, left: 500, top: 500 },
  { type: 'text', text: '1. Add nine to both sides', fontSize: 22, left: 100, top: 350 },
  { type: 'formula', latex: 'x^2+6x+9=16', left: 900, top: 120 },
  { type: 'text', text: '2. Factor the perfect square', fontSize: 22, left: 300, top: 240 },
  { type: 'formula', latex: String.raw`(x+3)^2=16\quad x=-3\pm4`, left: 100, top: 600 },
]
test('HTTP layout measures rendered math, creates exact gaps and stays clear of toolbar', async ({ page, request }, info) => {
  await ready(page, request)
  const nodes = await send(request, 'createMany', { specs: derivation })
  const ids = nodes.map(n => n.id), before = await send(request, 'observe')
  const arranged = await send(request, 'layout', { ids, direction: 'stack', gap: 24, margin: 32 })
  for (let i = 1; i < arranged.objects.length; i++) {
    const previous = arranged.objects[i-1].bounds, current = arranged.objects[i].bounds
    expect(current.top - previous.top - previous.height).toBeCloseTo(24, 6)
    expect(current.left).toBeCloseTo(previous.left, 6)
  }
  const toolbar = await page.getByRole('toolbar', { name: 'Drawing tools', exact: true }).boundingBox()
  expect(arranged.bounds.left).toBeGreaterThanOrEqual(toolbar.x + toolbar.width + 31)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await send(request, 'observe')).objects).toEqual(before.objects)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await send(request, 'observe')).objects).toEqual(arranged.objects)
  const measure = await send(request, 'measure', { id: ids[4] })
  await page.mouse.dblclick(measure.left+measure.width/2, measure.top+measure.height/2)
  await expect(page.getByLabel('LaTeX Formula:')).toHaveValue(derivation[4].latex)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await send(request, 'create', { spec: { type: 'rect', left: measure.left-12, top: measure.top-12,
    width: measure.width+24, height: measure.height+24, fill: null, stroke: '#16803b', strokeWidth: 2, mathboardInkMode: 'fixed' } })
  await page.mouse.move(1150, 650)
  await page.evaluate(() => document.fonts.ready)
  const path = info.outputPath('semantic-derivation.png')
  await page.screenshot({ path, animations: 'disabled', caret: 'hide' })
  await info.attach('measured-derivation-light', { path, contentType: 'image/png' })
  const stable = await send(request, 'observe')
  await send(request, 'measure', { id: ids[2] })
  expect(await send(request, 'observe')).toEqual(stable)
})
test('HTTP row remains within the actual safe area after zoom and pan', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await send(request, 'createMany', { specs: derivation.slice(1, 3) })
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Pan', exact: true }).click()
  await page.mouse.move(850, 450); await page.mouse.down(); await page.mouse.move(920, 490); await page.mouse.up()
  const result = await send(request, 'layout', { ids: nodes.map(n => n.id), direction: 'row', gap: 18 })
  expect(result.objects[1].bounds.left - result.objects[0].bounds.left - result.objects[0].bounds.width).toBeCloseTo(18, 6)
  expect(result.bounds.left).toBeGreaterThanOrEqual(result.safeArea.left - 1e-7)
  expect(result.bounds.top).toBeGreaterThanOrEqual(result.safeArea.top - 1e-7)
  expect(result.bounds.left + result.bounds.width).toBeLessThanOrEqual(result.safeArea.left + result.safeArea.width + 1e-6)
})
test('mobile layout clears the current board switcher', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await ready(page, request)
  const node = await send(request, 'create', { spec: { type: 'rect', width: 80, height: 60, left: 200, top: 300 } })
  const switcher = await page.getByRole('button', { name: 'Open Board library' }).boundingBox()
  const result = await send(request, 'layout', { ids: [node.id], margin: 16 })
  expect(result.safeArea.top).toBeGreaterThanOrEqual(switcher.y + switcher.height + 15)
  expect(result.bounds.top).toBeGreaterThanOrEqual(result.safeArea.top - 1e-7)
})
test('short mobile layout keeps objects right of the vertical drawing tools', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await ready(page, request)
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' })
  await expect(toolbar).toHaveCSS('flex-direction', 'column')
  const node = await send(request, 'create', { spec: { type: 'rect', width: 80, height: 60, left: 200, top: 300 } })
  const rail = await page.locator('.left-chrome').boundingBox()
  const result = await send(request, 'layout', { ids: [node.id], margin: 16 })
  expect(result.safeArea.left).toBeGreaterThanOrEqual(rail.x + rail.width + 15)
  expect(result.bounds.left).toBeGreaterThanOrEqual(result.safeArea.left - 1e-7)
  expect(result.bounds.top).toBeGreaterThanOrEqual(result.safeArea.top - 1e-7)
  expect(result.bounds.left + result.bounds.width).toBeLessThanOrEqual(result.safeArea.left + result.safeArea.width + 1e-6)
})
test('HTTP overflow changes neither scene nor the existing Redo command', async ({ page, request }) => {
  await ready(page, request)
  const nodes = await send(request, 'createMany', { specs: derivation.slice(0, 2) })
  const extra = await send(request, 'create', { spec: { type: 'rect', width: 30, height: 20, left: 400, top: 200 } })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await send(request, 'observe')).objects.length).toBe(2)
  const before = await send(request, 'observe')
  const response = await request.post('/__mathboard_agent/command', { data: { method: 'layout', params: { ids: nodes.map(n => n.id), gap: 10000 } } })
  expect(response.status()).toBe(409)
  expect(await send(request, 'observe')).toEqual(before)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(async () => (await send(request, 'observe')).objects.map(n => n.id)).toEqual([...nodes.map(n => n.id), extra.id])
})

test('Shapes submenu is excluded from layout area without the obsolete cookie banner', async ({ page, request }) => {
  await page.route(/simpleanalyticscdn\.com/, route => route.abort())
  await page.goto('/')
  await expect(page.locator('.cookie-banner')).toHaveCount(0)
  await expect.poll(async () => {
    const response = await request.post('/__mathboard_agent/command', { data: { method: 'observe' } })
    return response.ok() && (await response.json()).result.stable
  }).toBe(true)
  const [node] = await send(request, 'createMany', { specs: [{type: 'rect', width: 100, height: 80}] })
  await page.getByRole('button', { name: 'Shapes', exact: true }).click()
  const menu = await page.getByRole('group', { name: 'Shape options', exact: true }).boundingBox()
  const result = await send(request, 'layout', { ids: [node.id], margin: 16 })
  expect(result.safeArea.left).toBeGreaterThanOrEqual(menu.x+menu.width+15)
  expect(result.bounds.left).toBeGreaterThanOrEqual(result.safeArea.left-1e-7)
  expect(result.bounds.top+result.bounds.height).toBeLessThanOrEqual(result.safeArea.top+result.safeArea.height+1e-7)
})
