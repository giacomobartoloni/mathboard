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

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

const templatePath = path.join(
  projectRoot,
  'tools',
  'icon-template.html'
)

const publicDir = path.join(
  projectRoot,
  'public'
)

const sizes = [192, 512]

function assertIconPng(buffer, size, outputPath) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

  if (bytes.length < 26 || bytes.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${outputPath} is not a PNG`)
  }

  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const colorType = bytes[25]

  if (width !== size || height !== size) {
    throw new Error(
      `${outputPath} is ${width}x${height}, expected ${size}x${size}`
    )
  }

  // 4 = grayscale + alpha, 6 = truecolor + alpha.
  if (colorType !== 4 && colorType !== 6) {
    throw new Error(
      `${outputPath} has no alpha channel (PNG color type ${colorType})`
    )
  }
}

async function generateIcon(browser, html, size) {
  const page = await browser.newPage()

  try {
    await page.setViewport({
      width: size,
      height: size,
      deviceScaleFactor: 1,
    })

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })

    await page.evaluate(async (iconSize) => {
      document.documentElement.style.setProperty(
        '--icon-size',
        `${iconSize}px`
      )

      await document.fonts.ready

      const faces = await document.fonts.load(
        `400 ${Math.round(iconSize * 0.64)}px "Satisfy"`
      )

      if (!faces.length) {
        throw new Error('Satisfy font failed to load')
      }
    }, size)

    const fontStatus = await page.evaluate(() => {
      const mark = document.querySelector('.mathboard-mark')
      return {
        loaded: document.fonts.check('400 100px "Satisfy"'),
        family: mark ? getComputedStyle(mark).fontFamily : '',
      }
    })

    if (
      !fontStatus.loaded ||
      !/^["']?Satisfy["']?/i.test(fontStatus.family)
    ) {
      throw new Error(
        `Satisfy font is unavailable; icon generation aborted. Computed font-family: ${fontStatus.family || '(missing)'}`
      )
    }

    const capture = await page.$('#capture')

    if (!capture) {
      throw new Error(
        'Unable to find #capture in icon-template.html'
      )
    }

    const outputPath = path.join(
      publicDir,
      `icon-${size}x${size}.png`
    )

    const png = Buffer.from(await capture.screenshot({
      type: 'png',
      omitBackground: true,
    }))

    assertIconPng(png, size, `public/icon-${size}x${size}.png`)
    await fs.writeFile(outputPath, png)

    console.log(
      `Generated public/icon-${size}x${size}.png`
    )
  } finally {
    await page.close()
  }
}

async function main() {
  const html = await fs.readFile(
    templatePath,
    'utf8'
  )

  const browser = await puppeteer.launch({
    headless: true,
  })

  try {
    for (const size of sizes) {
      await generateIcon(browser, html, size)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Icon generation failed:')
  console.error(error)
  process.exitCode = 1
})
