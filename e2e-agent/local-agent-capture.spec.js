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

import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const commandUrl = '/__mathboard_agent/command'
async function command(request, method, params = {}) {
  const response = await request.post(commandUrl, { data: { method, params } })
  const body = await response.json()
  expect(response.status(), `${method}: ${JSON.stringify(body.error)}`).toBe(200)
  expect(body.ok).toBe(true)
  return body.result
}
async function rejected(request, params, code) {
  const response = await request.post(commandUrl, { data: { method: 'screenshot', params } })
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(409)
  expect(body.error.code).toBe(code)
  expect(body.result).toBeUndefined()
}
async function openBoard(page, request) {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(async () => {
    const response = await request.post(commandUrl, { data: { method: 'observe', params: {} } })
    return response.ok() && (await response.json()).result?.stable
  }).toBe(true)
  // Browser-only test introspection; no production hook or selector is installed.
  await page.evaluate(() => {
    const instance = document.querySelector('#boardcontainer').__vueParentComponent
    window.__captureTestBoard = instance.proxy
  })
}
async function pngEvidence(page, result, testInfo, name) {
  const bytes = Buffer.from(result.data, 'base64')
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(bytes.readUInt32BE(16)).toBe(result.widthPx)
  expect(bytes.readUInt32BE(20)).toBe(result.heightPx)
  const path = testInfo.outputPath(name)
  await mkdir(testInfo.outputDir, { recursive: true })
  await writeFile(path, bytes)
  await testInfo.attach(name, { path, contentType: 'image/png' })
  return page.evaluate(async ({ data }) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob()
    const image = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    const digest = await crypto.subtle.digest('SHA-256', pixels)
    let red = 0, blue = 0, dark = 0, bright = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 180 && pixels[i + 1] < 100 && pixels[i + 2] < 100 && pixels[i + 3]) red++
      if (pixels[i + 2] > 150 && pixels[i] < 100 && pixels[i + 1] < 150 && pixels[i + 3]) blue++
      if (pixels[i] > 200 && pixels[i + 1] > 200 && pixels[i + 2] > 200 && pixels[i + 3]) bright++
      if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80 && pixels[i + 3]) dark++
    }
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    image.close()
    return { width: canvas.width, height: canvas.height, hash, red, blue, dark, bright, corner: Array.from(pixels.slice(0, 4)) }
  }, { data: result.data })
}
async function snapshot(page, remember = false) {
  return page.evaluate(async remember => {
    const board = window.__captureTestBoard, canvas = board.canvas
    if (remember) window.__captureTestRefs = {
      canvas, objects: canvas.getObjects().slice(), active: canvas.getActiveObject(),
      history: board._boardHistory._entries.slice(), viewport: canvas.viewportTransform,
    }
    const refs = window.__captureTestRefs
    const databases = []
    for (const info of await indexedDB.databases()) {
      const db = await new Promise((resolve, reject) => {
        const operation = indexedDB.open(info.name)
        operation.onsuccess = () => resolve(operation.result)
        operation.onerror = () => reject(operation.error)
      })
      const stores = {}
      for (const name of Array.from(db.objectStoreNames)) {
        stores[name] = await new Promise((resolve, reject) => {
          const operation = db.transaction(name).objectStore(name).getAll()
          operation.onsuccess = () => resolve(operation.result)
          operation.onerror = () => reject(operation.error)
        })
      }
      databases.push({ name: info.name, stores })
      db.close()
    }
    return {
      boardId: board.getBoardId(), objects: canvas.getObjects().map(object => object.toObject(['mathboardId', 'latex', 'mathboardInkMode'])),
      selection: canvas.getActiveObjects().map(object => object.mathboardId),
      historyLength: board._boardHistory.summary().length, historyStep: board._boardHistory.summary().step,
      viewport: canvas.viewportTransform.slice(), zoom: canvas.getZoom(),
      local: { ...localStorage }, session: { ...sessionStorage }, databases,
      identities: {
        canvas: refs.canvas === canvas,
        objects: canvas.getObjects().every((object, i) => object === refs.objects[i]),
        active: refs.active === canvas.getActiveObject(),
        history: board._boardHistory._entries.every((entry, i) => entry === refs.history[i]),
        viewport: refs.viewport === canvas.viewportTransform,
      },
    }
  }, remember)
}

test('HTTP scene capture sees offscreen math, repeats pixels and reflects an agent update', async ({ page, request }, testInfo) => {
  await openBoard(page, request)
  const created = await command(request, 'createMany', { specs: [
    { type: 'text', text: 'Capture feedback', left: 3150, top: 2200, fontSize: 28 },
    { type: 'formula', latex: String.raw`\frac{x^2+1}{y}=\sqrt{2}`, left: 3120, top: 2270 },
    { type: 'rect', left: 3330, top: 2210, width: 85, height: 65, fill: '#ff2020', stroke: '#ff2020', mathboardInkMode: 'fixed' },
  ] })
  const params = { target: { kind: 'sceneRect', rect: { x: 3040, y: 2160, width: 480, height: 280 } }, scale: 1 }
  const observed = await command(request, 'observe')
  const first = await command(request, 'screenshot', params)
  expect(first.region).toMatchObject({ kind: 'sceneRect', coordinateSpace: 'scene', x: 3040, y: 2160, width: 480, height: 280 })
  expect(first.boardId).toBe(observed.boardId)
  expect(first.observationVersion).toBe(observed.version)
  const pixels = await pngEvidence(page, first, testInfo, 'offscreen-scene.png')
  expect(pixels.red).toBeGreaterThan(4000)
  expect(pixels.dark).toBeGreaterThan(400)
  const repeated = await pngEvidence(page, await command(request, 'screenshot', params), testInfo, 'offscreen-repeat.png')
  expect(repeated.hash).toBe(pixels.hash)
  // Move the live view far away at two zoom levels; the same scene crop must remain identical.
  for (const zoom of [0.5, 2]) {
    await page.evaluate(zoom => {
      const board = window.__captureTestBoard
      board.canvas.setViewportTransform([zoom, 0, 0, zoom, -730, 290])
      board.canvas.renderAll()
    }, zoom)
    const zoomed = await pngEvidence(page, await command(request, 'screenshot', params), testInfo, `scene-live-zoom-${zoom}.png`)
    expect(zoomed.hash).toBe(pixels.hash)
  }
  const doubled = await command(request, 'screenshot', { ...params, scale: 2 })
  expect([doubled.widthPx, doubled.heightPx]).toEqual([960, 560])
  const highResolution = await pngEvidence(page, doubled, testInfo, 'scene-scale2.png')
  expect(highResolution.red).toBeGreaterThan(pixels.red * 3)
  await command(request, 'update', { id: created[1].id, patch: { latex: String.raw`\int_0^1 x^3\,dx=\frac14` } })
  const updated = await pngEvidence(page, await command(request, 'screenshot', params), testInfo, 'scene-after-formula-update.png')
  expect(updated.hash).not.toBe(pixels.hash)
  expect((await command(request, 'observe')).objects.find(object => object.id === created[1].id).latex).toContain('int_0')
})

test('objectIds union, viewport and fractional crops preserve selection, identity, history and storage', async ({ page, request }, testInfo) => {
  await openBoard(page, request)
  const created = await command(request, 'createMany', { specs: [
    { type: 'formula', latex: String.raw`a^2+b^2=c^2`, left: 260, top: 200, angle: 15, scaleX: 1.3, scaleY: 1.1 },
    { type: 'rect', left: 510, top: 210, width: 110, height: 70, angle: 32, scaleX: 1.4, scaleY: 0.8, fill: '#2463eb', stroke: '#2463eb', strokeWidth: 8, mathboardInkMode: 'fixed' },
  ], options: { select: true } })
  await page.evaluate(async () => {
    const board = window.__captureTestBoard
    await board.flushPersistence()
    board.canvas.setViewportTransform([1.25, 0, 0, 1.25, -100, 35])
    board.canvas.renderAll()
  })
  const before = await snapshot(page, true)
  expect(before.selection).toHaveLength(2)
  const state = await command(request, 'observe')
  const ids = created.map(object => object.id)
  const bounds = await page.evaluate(() => window.__captureTestBoard.canvas.getObjects().map(object => object.getBoundingRect()))
  const x = Math.min(...bounds.map(b => b.left)), y = Math.min(...bounds.map(b => b.top))
  const width = Math.max(...bounds.map(b => b.left + b.width)) - x
  const height = Math.max(...bounds.map(b => b.top + b.height)) - y
  const result = await command(request, 'screenshot', { target: { kind: 'objectIds', ids, padding: 24 }, scale: 2 })
  expect(result.region.ids).toEqual(ids)
  expect(result.region.unionBounds.x).toBeCloseTo(x, 6)
  expect(result.region.unionBounds.y).toBeCloseTo(y, 6)
  expect(result.region.unionBounds.width).toBeCloseTo(width, 6)
  expect(result.region.unionBounds.height).toBeCloseTo(height, 6)
  expect(result.widthPx).toBe(Math.ceil((width + 48) * 2))
  expect(result.heightPx).toBe(Math.ceil((height + 48) * 2))
  const pixels = await pngEvidence(page, result, testInfo, 'rotated-formula-object-union.png')
  expect(pixels.blue).toBeGreaterThan(1000)
  expect(pixels.dark).toBeGreaterThan(200)
  const viewport = await command(request, 'screenshot', { target: { kind: 'viewport' } })
  expect(viewport.region).toMatchObject({ coordinateSpace: 'viewport', viewportTransform: [1.25, 0, 0, 1.25, -100, 35] })
  const size = await page.evaluate(() => [window.__captureTestBoard.canvas.getWidth(), window.__captureTestBoard.canvas.getHeight()])
  expect([viewport.widthPx, viewport.heightPx]).toEqual(size)
  await pngEvidence(page, viewport, testInfo, 'canvas-only-viewport.png')
  const fractional = await command(request, 'screenshot', { target: { kind: 'sceneRect', rect: { x: 240.25, y: 150.75, width: 333.2, height: 200.1 } }, scale: 1.5 })
  expect([fractional.widthPx, fractional.heightPx]).toEqual([500, 301])
  await pngEvidence(page, fractional, testInfo, 'fractional-rounded-scene.png')
  const concurrent = await Promise.all([command(request, 'screenshot', { target: { kind: 'objectIds', ids } }), command(request, 'screenshot', { target: { kind: 'objectIds', ids } })])
  expect(concurrent[0].data).toBe(concurrent[1].data)
  expect(await snapshot(page)).toEqual(before)
  expect(await command(request, 'observe')).toEqual(state)
  const workspacePath = testInfo.outputPath('whole-workspace-toolbar-context.png')
  await page.screenshot({ path: workspacePath })
  await testInfo.attach('whole-workspace-toolbar-context.png', { path: workspacePath, contentType: 'image/png' })
})

test('capture errors and readiness deadline preserve the live board', async ({ page, request }) => {
  test.setTimeout(30000)
  await openBoard(page, request)
  const group = await command(request, 'create', { spec: { type: 'group', left: 250, top: 200, objects: [
    { type: 'rect', left: 0, top: 0, width: 80, height: 50, fill: '#ff2020' },
  ] } })
  await page.evaluate(() => window.__captureTestBoard.flushPersistence())
  const before = await snapshot(page, true)
  for (const params of [
    {}, { target: { kind: 'viewport', rect: {} } }, { target: { kind: 'viewport' }, format: 'jpeg' },
    { target: { kind: 'objectIds', ids: [] } }, { target: { kind: 'objectIds', ids: [group.id, group.id] } },
    { target: { kind: 'objectIds', ids: [group.id], padding: -1 } }, { target: { kind: 'viewport' }, scale: 4 },
    { target: { kind: 'sceneRect', rect: { x: 0, y: 0, width: 0, height: 10 } } },
  ]) await rejected(request, params, 'invalid_capture_request')
  for (const ids of [['mbobj_missing'], [group.objects[0].id]]) await rejected(request, { target: { kind: 'objectIds', ids } }, 'object_not_found')
  await rejected(request, { target: { kind: 'sceneRect', rect: { x: 0, y: 0, width: 2049, height: 20 } } }, 'capture_too_large')
  await rejected(request, { target: { kind: 'sceneRect', rect: { x: 0, y: 0, width: 2048, height: 2048 } } }, 'capture_too_large')
  await page.evaluate(() => { window.__captureTestBoard.isPanning = true })
  await rejected(request, { target: { kind: 'viewport' } }, 'board_not_ready')
  await page.evaluate(() => { window.__captureTestBoard.isPanning = false })
  expect(await snapshot(page)).toEqual(before)
  // A blocked FontFaceSet promise exercises the real ten-second readiness deadline.
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(document.fonts, 'ready')
    let resolve
    const pending = new Promise(done => { resolve = done })
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => pending })
    window.__restoreCaptureFonts = () => {
      if (descriptor) Object.defineProperty(document.fonts, 'ready', descriptor)
      else delete document.fonts.ready
      resolve()
    }
  })
  try { await rejected(request, { target: { kind: 'viewport' } }, 'capture_failed') }
  finally { await page.evaluate(() => window.__restoreCaptureFonts()) }
  expect(await snapshot(page)).toEqual(before)
  expect((await request.get('/__mathboard_agent/health').then(response => response.json())).pendingCommands).toBe(0)
  await command(request, 'screenshot', { target: { kind: 'objectIds', ids: [group.id] } })
  expect(await snapshot(page)).toEqual(before)
})


test('transformed Board Group with nested formula captures dark theme and rejects pending renderer work', async ({ page, request }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('mathboard_board_theme', 'dark')
    localStorage.setItem('mathboard_ui_theme', 'dark')
  })
  await openBoard(page, request)
  const group = await command(request, 'create', { spec: {
    type: 'group', left: 320, top: 240, angle: -22, scaleX: 1.25, scaleY: 0.85,
    objects: [
      { type: 'formula', latex: String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`, left: 0, top: 0 },
      { type: 'rect', left: 230, top: 35, width: 80, height: 70, angle: 18, fill: '#ff2020', strokeWidth: 5, mathboardInkMode: 'fixed' },
    ],
  }, options: { select: true } })
  expect(group.objects[0].type).toBe('formula')
  expect(group.objects[0].latex).toContain('sum_')
  await page.evaluate(() => window.__captureTestBoard.flushPersistence())
  const before = await snapshot(page, true)
  const state = await command(request, 'observe')
  const capture = await command(request, 'screenshot', { target: { kind: 'objectIds', ids: [group.id], padding: 24 }, scale: 2 })
  const bounds = await page.evaluate(() => window.__captureTestBoard.canvas.getObjects()[0].getBoundingRect())
  expect(capture.region.unionBounds.x).toBeCloseTo(bounds.left, 6)
  expect(capture.region.unionBounds.y).toBeCloseTo(bounds.top, 6)
  expect(capture.region.unionBounds.width).toBeCloseTo(bounds.width, 6)
  expect(capture.region.unionBounds.height).toBeCloseTo(bounds.height, 6)
  const pixels = await pngEvidence(page, capture, testInfo, 'dark-transformed-board-group.png')
  expect(pixels.bright).toBeGreaterThan(300)
  expect(pixels.red).toBeGreaterThan(1000)
  expect(pixels.corner[0]).toBeLessThan(70)
  expect(pixels.corner[1]).toBeLessThan(70)
  expect(pixels.corner[2]).toBeLessThan(80)
  await rejected(request, { target: { kind: 'objectIds', ids: [group.objects[0].id] } }, 'object_not_found')
  expect(await snapshot(page)).toEqual(before)
  // Hold the underlying MathJax runtime, then call the real wrapped renderer directly.
  // No bridge mutation is pending: this isolates the render-tracking readiness guard.
  await page.evaluate(() => {
    const renderer = window.__captureTestBoard._formulaRenderer
    const runtime = renderer.mathJaxRuntime
    const original = runtime.renderSvg
    let release
    const barrier = new Promise(resolve => { release = resolve })
    runtime.renderSvg = async function (...args) {
      window.__captureRenderEntered = true
      await barrier
      return original.apply(this, args)
    }
    window.__pendingCaptureFormula = renderer.render({ latex: 'x+1', position: { x: 0, y: 0 }, ink: '#f5f5f5' }).then(formula => formula.dispose())
    window.__releaseCaptureFormula = () => { runtime.renderSvg = original; release() }
  })
  await page.waitForFunction(() => window.__captureRenderEntered === true)
  try { await rejected(request, { target: { kind: 'objectIds', ids: [group.id] } }, 'board_not_ready') }
  finally {
    await page.evaluate(async () => {
      window.__releaseCaptureFormula()
      await window.__pendingCaptureFormula
    })
  }
  const repeated = await pngEvidence(page, await command(request, 'screenshot', { target: { kind: 'objectIds', ids: [group.id], padding: 24 }, scale: 2 }), testInfo, 'dark-group-after-readiness-recovery.png')
  expect(repeated.hash).toBe(pixels.hash)
  expect(await snapshot(page)).toEqual(before)
  expect(await command(request, 'observe')).toEqual(state)
})
