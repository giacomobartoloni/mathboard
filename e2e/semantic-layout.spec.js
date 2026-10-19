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
import { gotoBoard } from './fixtures.js'
import { getBoardState } from './helpers/canvas.js'
test('layout hook produces readable rows without measurement history side effects', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await gotoBoard(page)
  const nodes = await page.evaluate(() => window.__MATHBOARD_E2E__.createObjects([
    {type:'text',text:'Vector length',fontSize:28,left:500,top:500},
    {type:'formula',latex:'r=3',left:200,top:300},
  ]))
  const result = await page.evaluate(ids => window.__MATHBOARD_E2E__.layoutObjects({ids,direction:'row',gap:30}), nodes.map(n => n.id))
  expect(result.objects[1].bounds.left-result.objects[0].bounds.left-result.objects[0].bounds.width).toBeCloseTo(30,6)
  const before = await getBoardState(page)
  await page.evaluate(id => window.__MATHBOARD_E2E__.measureObject(id), nodes[1].id)
  expect(await getBoardState(page)).toEqual(before)
  await page.keyboard.press('ControlOrMeta+z')
  expect((await getBoardState(page)).history.step).toBe(before.history.step-1)
})
