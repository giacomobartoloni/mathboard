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
const projectRoot = path.resolve(path.dirname(__filename), '..')
const templatePath = path.join(projectRoot, 'tools', 'icon-template.html')
const fontPath = path.join(
  projectRoot, 'node_modules', '@fontsource', 'satisfy',
  'files', 'satisfy-latin-400-normal.woff2'
)
const publicDir = path.join(projectRoot, 'public')

const faviconSizes = [16, 32, 48, 96]
const pwaSizes = [192, 512]
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function pngSize(buffer) {
  const png = Buffer.from(buffer)
  if (
    png.length < 26 ||
    !png.subarray(0, 8).equals(pngSignature) ||
    png.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Invalid PNG header')
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
  }
}

function assertPng(buffer, size, fileName, allowOpaque = false) {
  const {width, height, colorType} = pngSize(buffer)
  if (width !== size || height !== size) {
    throw new Error(`${fileName}: expected ${size}x${size}, got ${width}x${height}`)
  }
  if (colorType !== 4 && colorType !== 6 && !(allowOpaque && colorType === 2)) {
    throw new Error(`${fileName}: unexpected PNG color type ${colorType}`)
  }
}

// ICO accepts embedded PNG frames (Windows Vista and modern browsers).
// Avoid the original 140 KB single-resolution ICO: include only 16, 32, 48.
export function createIco(frames) {
  if (frames.length !== 3) {
    throw new Error('ICO requires 16, 32 and 48 pixel frames')
  }
  const sizes = [16, 32, 48]
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length

  for (const [index, frame] of frames.entries()) {
    const png = Buffer.from(frame)
    const {width, height} = pngSize(png)
    if (width !== sizes[index] || height !== sizes[index]) {
      throw new Error(`ICO frame ${index} must be ${sizes[index]}x${sizes[index]}`)
    }
    const entry = 6 + index * 16
    header[entry] = sizes[index]
    header[entry + 1] = sizes[index]
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  }
  return Buffer.concat([header, ...frames])
}

async function renderIcon(browser, html, size, variant, fileName) {
  const page = await browser.newPage()
  try {
    await page.setViewport({
      width: size, height: size, deviceScaleFactor: 1,
    })
    await page.setContent(html, {waitUntil: 'load'})
    await page.evaluate(async ({iconSize, iconVariant}) => {
      document.documentElement.style.setProperty('--icon-size', `${iconSize}px`)
      document.documentElement.dataset.iconVariant = iconVariant
      await document.fonts.ready
      const faces = await document.fonts.load('400 100px "Satisfy"')
      if (!faces.length || !document.fonts.check('400 100px "Satisfy"')) {
        throw new Error('Local Satisfy font did not load')
      }
    }, {iconSize: size, iconVariant: variant})

    const markFamily = await page.$eval(
      '.mathboard-mark', (el) => getComputedStyle(el).fontFamily
    )
    if (!/^["']?Satisfy["']?/i.test(markFamily)) {
      throw new Error(`Unexpected mark font-family: ${markFamily}`)
    }

    const capture = await page.$('#capture')
    if (!capture) throw new Error('Missing #capture in icon-template.html')
    const png = Buffer.from(await capture.screenshot({
      type: 'png',
      omitBackground: true,
    }))
    assertPng(png, size, fileName, variant === 'apple')

    // iOS home-screen icons must be opaque; check all rendered pixels.
    if (variant === 'apple') {
      const opaque = await page.evaluate(() => {
        const capture = document.querySelector('#capture')
        return getComputedStyle(capture).backgroundColor === 'rgb(61, 61, 61)'
      })
      if (!opaque) throw new Error('Apple icon background must be opaque')
    }
    return png
  } finally {
    await page.close()
  }
}

async function main() {
  const onlyFavicons = process.argv.slice(2).includes('--favicons-only')
  const source = await fs.readFile(templatePath, 'utf8')
  const font = await fs.readFile(fontPath)
  const face = `<style>
    @font-face {
      font-family: "Satisfy";
      font-style: normal;
      font-weight: 400;
      font-display: block;
      src: url("data:font/woff2;base64,${font.toString('base64')}") format("woff2");
    }
  </style>`
  if (!source.includes('<!-- LOCAL_SATISFY_FONT -->')) {
    throw new Error('Missing local font insertion point')
  }
  const html = source.replace('<!-- LOCAL_SATISFY_FONT -->', face)
  // GitHub's Linux runners restrict Chrome's namespace sandbox.
  // The renderer loads only our checked-in template and local WOFF2.
  const ciLinux = process.env.CI === 'true' && process.platform === 'linux'
  const browser = await puppeteer.launch({
    headless: true,
    args: ciLinux ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  })

  try {
    const icoFrames = []
    for (const size of faviconSizes) {
      const filename = `favicon-${size}x${size}.png`
      const png = await renderIcon(browser, html, size, 'favicon', filename)
      await fs.writeFile(path.join(publicDir, filename), png)
      if (size <= 48) icoFrames.push(png)
      console.log(`Generated public/${filename}`)
    }

    const ico = createIco(icoFrames)
    await fs.writeFile(path.join(publicDir, 'favicon.ico'), ico)
    console.log('Generated public/favicon.ico (16, 32, 48)')

    const apple = await renderIcon(
      browser, html, 180, 'apple', 'apple-touch-icon.png'
    )
    await fs.writeFile(path.join(publicDir, 'apple-touch-icon.png'), apple)
    console.log('Generated public/apple-touch-icon.png')

    if (!onlyFavicons) {
      for (const size of pwaSizes) {
        const filename = `icon-${size}x${size}.png`
        const png = await renderIcon(browser, html, size, 'pwa', filename)
        await fs.writeFile(path.join(publicDir, filename), png)
        console.log(`Generated public/${filename}`)
      }
    }

  } finally {
    await browser.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error('Icon generation failed:')
    console.error(error)
    process.exitCode = 1
  })
}
