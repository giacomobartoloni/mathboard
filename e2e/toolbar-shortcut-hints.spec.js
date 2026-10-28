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

    // The button animates its foreground color on selection; wait for it to settle.
    const assertDarkerThanIcon = async () => {
      await expect.poll(async () => {
        const { hintColor, iconColor } = await pen.evaluate((button) => ({
          hintColor: getComputedStyle(button.querySelector('.tool-shortcut-hint')).color,
          iconColor: getComputedStyle(button.querySelector('svg')).color,
        }))
        const channels = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number)
        const hintChannels = channels(hintColor)
        const iconChannels = channels(iconColor)
        return hintChannels.every((value, index) => value < iconChannels[index])
      }, { message: 'Shortcut hint should be dimmer than the icon after color transitions' }).toBe(true)
    }
    if (boardTheme !== 'light') await assertDarkerThanIcon()

    await pen.click()
    if (selectedGray) await expect(hint).toHaveCSS('color', selectedGray)
    else {
      await expect.poll(() => pen.evaluate((button) =>
        getComputedStyle(button.querySelector('.tool-shortcut-hint')).color === getComputedStyle(button).color,
      )).toBe(true)
    }
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
  { width: 1024, height: 768, mode: 'full' },
  { width: 640, height: 600, mode: 'full' },
  { width: 1280, height: 600, mode: 'full' },
  { width: 1280, height: 585, mode: 'full' },
  { width: 1280, height: 560, mode: 'full' },
  { width: 1280, height: 440, mode: 'compact' },
  { width: 320, height: 568 },
  { width: 844, height: 390, mode: 'compact' },
]) {
  test(`hints degrade gracefully at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const before = await gotoBoard(page)
    const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' })
    await expect(toolbar).toHaveCSS('flex-direction', 'column')
    const rail = page.locator('.left-chrome')
    if (viewport.mode === 'compact') await expect(rail).toHaveClass(/tools-compact/)
    if (viewport.mode === 'full') await expect(rail).not.toHaveClass(/tools-compact/)
    const compact = await rail.evaluate((node) => node.classList.contains('tools-compact'))
    for (const [name] of tools) {
      const button = page.getByRole('button', { name, exact: true })
      const hidden = compact && !['Select', 'Pan', 'Pen'].includes(name)
      if (hidden) await expect(button).toBeHidden()
      else {
        await expect(button).toBeInViewport()
        await button.click({ trial: true })
      }
      const hint = button.locator('span')
      if (hidden || viewport.height <= 700 || viewport.width <= 600) await expect(hint).toBeHidden()
      else await expect(hint).toBeVisible()
    }
    const stamps = page.getByRole('button', { name: 'Stamps', exact: true })
    const colors = page.locator('.color-panel')
    if (compact) {
      await expect(stamps).toBeHidden()
      await expect(colors).toBeHidden()
    } else {
      await expect(stamps).toBeVisible()
      await expect(colors).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeInViewport()
    const railBox = await rail.boundingBox()
    const viewControls = await page.getByRole('toolbar', { name: 'Board view and history' }).boundingBox()
    expect(railBox.y + railBox.height).toBeLessThanOrEqual(viewControls.y - 8)
    expect(railBox.x + railBox.width).toBeLessThanOrEqual(viewport.width)
    expect(await getBoardState(page)).toEqual(before)
    const path = testInfo.outputPath('constrained.png')
    await page.screenshot({ path, animations: 'disabled' })
    await testInfo.attach('constrained toolbar', { path, contentType: 'image/png' })
  })
}

test('minimal rail restores all controls after viewport expansion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const before = await gotoBoard(page)
  const rail = page.locator('.left-chrome')
  await expect(rail).not.toHaveClass(/tools-compact/)

  await page.setViewportSize({ width: 1280, height: 440 })
  await expect(rail).toHaveClass(/tools-compact/)
  await expect(page.locator('.color-panel')).toBeHidden()

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(rail).not.toHaveClass(/tools-compact/)
  await expect(page.locator('.color-panel')).toBeVisible()
  expect(await getBoardState(page)).toEqual(before)
})

test('DPR 3 desktop at 1280x585 keeps vertical tools clear of view controls', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 585 },
    deviceScaleFactor: 3,
  })
  try {
    const page = await context.newPage()
    const before = await gotoBoard(page)
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3)
    await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toHaveCSS('flex-direction', 'column')
    const rail = await page.locator('.left-chrome').boundingBox()
    const viewControls = await page.getByRole('toolbar', { name: 'Board view and history' }).boundingBox()
    expect(rail.y + rail.height).toBeLessThanOrEqual(viewControls.y - 8)
    await page.getByRole('button', { name: 'Stamps', exact: true }).click({ trial: true })
    expect(await getBoardState(page)).toEqual(before)
  } finally {
    await context.close()
  }
})

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
