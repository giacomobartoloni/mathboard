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

import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'
import { downloadBoardDocument } from '../src/board/persistence/downloadBoardDocument.js'

test('Board Library exports a .mathboard filename with unchanged JSON payload', async (t) => {
  const document = createEmptyBoardDocument('Algebra / Geometry')
  let downloadedName = ''
  let exportedBlob
  let appended = false
  let clicked = false
  let removed = false
  let revoked = false
  const anchor = {
    href: '',
    download: '',
    click() { clicked = true; downloadedName = this.download },
    remove() { removed = true },
  }
  const previousWindow = globalThis.window
  const previousCreateObjectURL = URL.createObjectURL
  const previousRevokeObjectURL = URL.revokeObjectURL
  globalThis.window = {
    document: {
      createElement(tag) {
        assert.equal(tag, 'a')
        return anchor
      },
      body: {
        appendChild(element) {
          assert.equal(element, anchor)
          appended = true
        },
      },
    },
  }
  URL.createObjectURL = blob => {
    exportedBlob = blob
    return 'blob:mathboard-export-test'
  }
  URL.revokeObjectURL = url => {
    assert.equal(url, 'blob:mathboard-export-test')
    revoked = true
  }
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    URL.createObjectURL = previousCreateObjectURL
    URL.revokeObjectURL = previousRevokeObjectURL
  })

  downloadBoardDocument(document)
  assert.equal(downloadedName, 'Algebra - Geometry.mathboard')
  assert.ok(!downloadedName.endsWith('.json'))
  assert.equal(exportedBlob.type, 'application/json')
  assert.deepEqual(JSON.parse(await exportedBlob.text()), document)
  assert.ok(appended && clicked && removed)
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.ok(revoked)
})
