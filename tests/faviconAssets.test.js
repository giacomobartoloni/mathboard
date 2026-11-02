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

import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {createIco, pngSize} from '../tools/generate-icons.mjs'

const root = new URL('../', import.meta.url)

function syntheticPng(size) {
  const png = Buffer.alloc(26)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.write('IHDR', 12, 'ascii')
  png.writeUInt32BE(size, 16)
  png.writeUInt32BE(size, 20)
  png[25] = 6
  return png
}

test('favicon generator packages 16/32/48 PNG frames into a valid ICO directory', () => {
  const sizes = [16, 32, 48]
  const frames = sizes.map(syntheticPng)
  const ico = createIco(frames)

  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 3)
  for (const [i, size] of sizes.entries()) {
    const entry = 6 + i * 16
    assert.equal(ico[entry], size)
    assert.equal(ico[entry + 1], size)
    const length = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    assert.deepEqual(ico.subarray(offset, offset + length), frames[i])
  }
  assert.throws(() => createIco(frames.slice(1)), /16, 32 and 48/)
  assert.throws(() => createIco([frames[1], frames[0], frames[2]]), /must be 16x16/)
})

test('PNG dimensions are parsed from a real PNG header', () => {
  assert.deepEqual(pngSize(syntheticPng(32)), {
    width: 32, height: 32, colorType: 6,
  })
  assert.throws(() => pngSize(Buffer.from('not a png')), /Invalid PNG/)
})

test('favicon, Apple and PWA links use dedicated assets and formats', async () => {
  const [page, manifestText] = await Promise.all([
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('public/manifest.json', root), 'utf8'),
  ])

  for (const size of [16, 32, 48, 96]) {
    assert.match(page, new RegExp(
      `rel="icon" type="image/png" sizes="${size}x${size}" href="/favicon-${size}x${size}\\.png"`
    ))
  }
  assert.match(
    page, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/
  )
  assert.doesNotMatch(page, /favicon\.(?:svg|png)/)
  const icons = JSON.parse(manifestText).icons
  assert.deepEqual(icons.map(({sizes}) => sizes), ['192x192', '512x512'])
  assert.ok(icons.every(({purpose}) => purpose === 'any'))
})


test('checked-in favicon assets have correct dimensions and the ICO matches PNG frames', async () => {
  const faviconSizes = [16, 32, 48, 96]
  const frames = await Promise.all(faviconSizes.map(async (size) => {
    const filename = `public/favicon-${size}x${size}.png`
    const data = await readFile(new URL(filename, root))
    const metadata = pngSize(data)
    assert.equal(metadata.width, size, filename)
    assert.equal(metadata.height, size, filename)
    assert.ok([4, 6].includes(metadata.colorType), filename)
    return data
  }))
  const apple = await readFile(new URL('public/apple-touch-icon.png', root))
  assert.deepEqual(pngSize(apple), {width: 180, height: 180, colorType: 2})

  const ico = await readFile(new URL('public/favicon.ico', root))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 3)
  for (const [i, size] of faviconSizes.slice(0, 3).entries()) {
    const entry = 6 + i * 16
    assert.equal(ico[entry], size)
    assert.equal(ico[entry + 1], size)
    const length = ico.readUInt32LE(entry + 8)
    const offset = ico.readUInt32LE(entry + 12)
    assert.deepEqual(ico.subarray(offset, offset + length), frames[i])
  }
  for (const size of [192, 512]) {
    const png = await readFile(new URL(`public/icon-${size}x${size}.png`, root))
    const metadata = pngSize(png)
    assert.equal(metadata.width, size)
    assert.equal(metadata.height, size)
  }
})
