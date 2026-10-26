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

test('a delayed UI stamp cannot land on a board opened during materialization', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef?.sessionReady,
  ))).toBe(true)

  await page.evaluate(async () => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    await board.getBoardController().create({ type: 'rect', width: 40, height: 30 })
    const clone = await board.canvas.getObjects()[0].clone()
    let resume
    board._materializeStamp = () => new Promise(resolve => { resume = () => resolve([clone]) })
    window.__resumeStampForTest = () => resume()
    window.__pendingStampForTest = board.insertStamp('deferred')
  })

  await page.evaluate(async () => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    await board.getBoardWorkspace().create({ title: 'Next board' })
  })
  const result = await page.evaluate(async () => {
    window.__resumeStampForTest()
    const stamp = await window.__pendingStampForTest
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    return { stamp, objects: board.getBoardController().observe().objects }
  })

  expect(result.stamp.ok).toBe(false)
  expect(result.objects).toEqual([])
})

test('a direct UI add is rolled back while a board transition is pending', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef?.sessionReady,
  ))).toBe(true)

  const result = await page.evaluate(async () => {
    const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
    await board.getBoardController().create({ type: 'rect', width: 40, height: 30 })
    const clone = await board.canvas.getObjects()[0].clone()
    let finish
    const pending = board._boardLifecycle.transition(async () => new Promise(resolve => { finish = resolve }))
    const pointerEvents = board.canvas.upperCanvasEl.style.pointerEvents
    board.canvas.add(clone)
    const committed = board._recordAdd(clone)
    const count = board.canvas.getObjects().length
    finish()
    await pending
    return { committed, count, pointerEvents }
  })

  expect(result).toEqual({ committed: false, count: 1, pointerEvents: 'none' })
})

for (const mode of ['same-board reopen', 'A to B to A']) {
  test(`a delayed Formula cannot commit after ${mode}`, async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('canvas.upper-canvas')).toBeVisible()
    await expect.poll(() => page.evaluate(() => Boolean(
      document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef?.sessionReady,
    ))).toBe(true)

    const result = await page.evaluate(async (transitionMode) => {
      const board = document.querySelector('#app').__vue_app__._instance.proxy.drawBoardRef
      const boardId = board.getBoardId()
      const controller = board.getBoardController()
      const buildFormula = controller._buildFormula
      let finish
      controller._buildFormula = spec => new Promise(resolve => { finish = () => resolve(buildFormula(spec)) })
      const pending = controller.create({ type: 'formula', latex: 'x=1' })
        .then(() => ({ ok: true }), error => ({ ok: false, code: error.code }))
      const workspace = board.getBoardWorkspace()
      if (transitionMode === 'A to B to A') await workspace.create({ title: 'B' })
      await workspace.open({ boardId })
      finish()
      const operation = await pending
      return { operation, objects: controller.observe().objects,
        historyLength: board._boardHistory.summary().length }
    }, mode)

    expect(result).toEqual({ operation: { ok: false, code: 'board_not_ready' },
      objects: [], historyLength: 0 })
  })
}
