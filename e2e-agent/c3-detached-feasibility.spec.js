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

test('detached browser Canvas can run all candidate document methods without touching the visible board', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  const before = await (await request.post('/__mathboard_agent/command', { data: { method: 'observe', params: {} } })).json()
  const result = await page.evaluate(async () => {
    const { runDetachedFeasibility } = await import('/e2e-agent/helpers/c3-detached-feasibility.js')
    return runDetachedFeasibility()
  })
  const after = await (await request.post('/__mathboard_agent/command', { data: { method: 'observe', params: {} } })).json()
  expect(result.canvasAttached).toBe(false)
  expect(result.beforeDelete.objects.map(object => object.id)).toEqual([
    result.created.id, result.batch[0].id, result.batch[1].id, result.group.id,
  ])
  expect(result.measured.width).toBeGreaterThan(0)
  expect(result.measured.height).toBeGreaterThan(0)
  expect(result.afterClear.objects).toEqual([])
  expect(result.historyCount).toBe(7)
  expect(after.result.objects).toEqual(before.result.objects)
})
