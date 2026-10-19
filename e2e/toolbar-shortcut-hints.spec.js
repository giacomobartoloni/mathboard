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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { test, expect } from '@playwright/test'
import { gotoBoard } from './fixtures.js'
import { clickOnCanvas, getBoardState } from './helpers/canvas.js'

const tools = [
  ['Select', 'V'], ['Pan', 'H'], ['Pen', 'P'],
  ['Text', 'T'], ['Formula', 'F'], ['Shapes', 'S'],
]

test('desktop hints preserve accessible names, tab order and board state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const before = await gotoBoard(page)
  for (const [name, key] of tools) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button).toHaveAttribute('title', `${name} (${key})`)
    const hint = button.locator('span[aria-hidden="true"]')
    await expect(hint).toHaveText(key)
    await expect(hint).toBeVisible()
    await expect(hint).not.toHaveAttribute('tabindex')
    const buttonBox = await button.boundingBox()
    const hintBox = await hint.boundingBox()
    // The key belongs to the lower-right corner, leaving the icon centered.
    expect(hintBox.x + hintBox.width / 2).toBeGreaterThan(buttonBox.x + buttonBox.width * 0.65)
    expect(buttonBox.x + buttonBox.width - hintBox.x - hintBox.width).toBeGreaterThanOrEqual(0)
    expect(buttonBox.x + buttonBox.width - hintBox.x - hintBox.width).toBeLessThanOrEqual(8)
    expect(buttonBox.y + buttonBox.height - hintBox.y - hintBox.height).toBeGreaterThanOrEqual(0)
    expect(buttonBox.y + buttonBox.height - hintBox.y - hintBox.height).toBeLessThanOrEqual(8)
  }
  await expect(page.getByRole('button', { name: 'Stamps', exact: true }).locator('span')).toHaveCount(0)
  await page.getByRole('button', { name: 'Select', exact: true }).focus()
  for (const [name] of tools.slice(1)) {
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
  }
  expect(await getBoardState(page)).toEqual(before)
})


for (const [boardTheme, idleGray, selectedGray] of [
  ['light', 'rgb(153, 153, 153)', null],
  ['dark', 'rgb(136, 136, 136)', 'rgb(187, 187, 187)'],
  ['chalkboard', 'rgb(136, 136, 136)', 'rgb(187, 187, 187)'],
]) {
  test(`shortcut hints are thinner and subdued in ${boardTheme} UI`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoBoard(page, '/', { boardTheme })
    const pen = page.getByRole('button', { name: 'Pen', exact: true })
    const hint = pen.locator('.tool-shortcut-hint')
    await expect(hint).toHaveCSS('color', idleGray)
    await expect(hint).toHaveCSS('font-weight', '300')

    // In dark chrome, both idle and selected hints must be dimmer than the icon.
    const assertDarkerThanIcon = async () => {
      const { hintColor, iconColor } = await pen.evaluate((button) => ({
        hintColor: getComputedStyle(button.querySelector('.tool-shortcut-hint')).color,
        iconColor: getComputedStyle(button).color,
      }))
      const channels = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number)
      const hintChannels = channels(hintColor)
      const iconChannels = channels(iconColor)
      expect(hintChannels.every((value, index) => value < iconChannels[index])).toBe(true)
    }
    if (boardTheme !== 'light') await assertDarkerThanIcon()

    await pen.click()
    const selectedForeground = await pen.evaluate((button) => getComputedStyle(button).color)
    await expect(hint).toHaveCSS('color', selectedGray ?? selectedForeground)
    await expect(hint).toHaveCSS('font-weight', '300')
    if (boardTheme !== 'light') await assertDarkerThanIcon()
  })
}

for (const [name, key] of tools) {
  test(`${name} hint matches pointer and keyboard selection`, async ({ page }) => {
    await gotoBoard(page)
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    if (name === 'Formula') await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.keyboard.press(key.toLowerCase())
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  })
}


for (const boardTheme of ['light', 'dark', 'chalkboard']) {
  test(`hints remain readable in ${boardTheme} and fullscreen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await gotoBoard(page, '/', { boardTheme })
    await page.evaluate(() => document.fonts.ready)
    const pen = page.getByRole('button', { name: 'Pen', exact: true })
    await pen.click()
    await pen.focus()
    await expect(pen).toBeFocused()
    await expect(pen.locator('span')).toBeVisible()
    const path = testInfo.outputPath(`${boardTheme}-desktop.png`)
    await page.screenshot({ path, animations: 'disabled' })
    await testInfo.attach(`${boardTheme} desktop`, { path, contentType: 'image/png' })
    await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible()
    for (const [name] of tools) {
      await expect(page.getByRole('button', { name, exact: true }).locator('span')).toBeVisible()
    }
    const fullscreenPath = testInfo.outputPath(`${boardTheme}-fullscreen.png`)
    await page.screenshot({ path: fullscreenPath, animations: 'disabled' })
    await testInfo.attach(`${boardTheme} fullscreen`, { path: fullscreenPath, contentType: 'image/png' })
  })
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 640, height: 600 },
  { width: 1280, height: 600 },
]) {
  test(`hints degrade gracefully at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const before = await gotoBoard(page)
    for (const [name] of tools) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeInViewport()
      const hint = button.locator('span')
      if (viewport.height <= 700 || viewport.width <= 600) await expect(hint).toBeHidden()
      else await expect(hint).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeInViewport()
    expect(await getBoardState(page)).toEqual(before)
    const path = testInfo.outputPath('constrained.png')
    await page.screenshot({ path, animations: 'disabled' })
    await testInfo.attach('constrained toolbar', { path, contentType: 'image/png' })
  })
}

for (const lineHeight of ['normal', '18px']) {
test(`coarse pointer preserves incumbent touch targets with ${lineHeight} line height`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  })
  try {
    const page = await context.newPage()
    await gotoBoard(page)
    await page.getByRole('toolbar', { name: 'Drawing tools', exact: true }).evaluate((toolbar, value) => {
      toolbar.style.lineHeight = value
    }, lineHeight)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    // Stamps keeps the original button styling and shares inherited font metrics.
    const incumbent = await page.getByRole('button', { name: 'Stamps', exact: true }).boundingBox()
    const dimensions = { incumbent, tools: {} }
    for (const [name] of tools) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeInViewport()
      await expect(button.locator('span')).toBeHidden()
      const box = await button.boundingBox()
      dimensions.tools[name] = box
      expect(box.height).toBeGreaterThanOrEqual(incumbent.height)
      expect(box.width).toBeGreaterThanOrEqual(incumbent.width)
    }
    await testInfo.attach('touch target dimensions', {
      body: JSON.stringify(dimensions, null, 2), contentType: 'application/json',
    })
    const path = testInfo.outputPath('touch.png')
    await page.screenshot({ path, animations: 'disabled' })
    await testInfo.attach('touch toolbar', { path, contentType: 'image/png' })
  } finally {
    await context.close()
  }
})
}

test('advertised shortcuts do not steal formula or Fabric text input', async ({ page }) => {
  await gotoBoard(page)
  await page.getByRole('button', { name: 'Formula', exact: true }).click()
  await clickOnCanvas(page, { x: 340, y: 240 })
  const input = page.getByLabel('LaTeX Formula:')
  await input.pressSequentially('vhptfs')
  await expect(input).toHaveValue('vhptfs')
  await expect(page.getByRole('button', { name: 'Formula', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await clickOnCanvas(page, { x: 340, y: 240 })
  const text = page.locator('textarea').first()
  await text.fill('')
  await text.pressSequentially('vhptfs')
  await expect(text).toHaveValue('vhptfs')
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
