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

import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { ref } from 'vue'
import { useBoardSharePanel } from '../src/composables/useBoardSharePanel.js'
import { ANALYTICS_EVENTS } from '../src/analytics/events.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'

if (!globalThis.crypto) globalThis.crypto = webcrypto

function fixture({ ready = true, document = createEmptyBoardDocument('Class lesson') } = {}) {
  const events = []
  let captures = 0
  const boardSessionReady = ref(ready)
  const share = useBoardSharePanel({
    boardSessionReady,
    drawBoardRef: { value: {
      captureBoardDocument() {
        captures += 1
        if (document instanceof Error) throw document
        return document
      },
    } },
    desktopRuntime: false,
    trackEvent: (name, metadata) => events.push({ name, metadata }),
  })
  return { ...share, events, boardSessionReady, captureCount: () => captures }
}

test('opening Share never uploads and closing without a link records abandonment', () => {
  const f = fixture()
  assert.equal(f.showBoardSharePanel.value, false)
  f.openBoardSharePanel()
  f.openBoardSharePanel()
  assert.equal(f.showBoardSharePanel.value, true)
  assert.equal(f.boardShareUrl.value, '')
  assert.equal(f.captureCount(), 0)
  assert.deepEqual(f.events.map(x => x.name), [ANALYTICS_EVENTS.BOARD_SHARE_PANEL_OPENED])
  f.closeBoardSharePanel()
  assert.equal(f.showBoardSharePanel.value, false)
  assert.deepEqual(f.events.at(-1), {
    name: ANALYTICS_EVENTS.BOARD_SHARE_PANEL_CLOSED, metadata: { outcome: 'abandoned' },
  })
  f.boardSessionReady.value = false
  f.openBoardSharePanel()
  assert.equal(f.showBoardSharePanel.value, false)
})

test('Get shareable link explicitly encrypts/uploads once and preserves analytics semantics', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  let uploads = 0
  globalThis.window = { location: { origin: 'https://mathboard.app', pathname: '/' } }
  globalThis.fetch = async (url, options) => {
    uploads += 1
    assert.equal(url, 'https://mathboard.app/api/shares')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers['Content-Type'], 'application/octet-stream')
    assert.ok(options.body.byteLength > 28)
    return new Response(JSON.stringify({ id: 'A'.repeat(22), expiresAt: '2027-02-14T00:00:00.000Z' }), { status: 201 })
  }
  try {
    const f = fixture()
    f.openBoardSharePanel()
    assert.equal(uploads, 0)
    const request = f.requestBoardShareLink()
    const duplicate = f.requestBoardShareLink()
    assert.equal(f.boardShareBusy.value, true)
    f.closeBoardSharePanel()
    assert.equal(f.showBoardSharePanel.value, true)
    await Promise.all([request, duplicate])
    assert.equal(f.boardShareBusy.value, false)
    assert.equal(uploads, 1)
    assert.equal(f.captureCount(), 1)
    assert.match(f.boardShareUrl.value, /^https:\/\/mathboard\.app\/#b=A{22},[A-Za-z0-9_-]{43}$/)
    await f.requestBoardShareLink()
    assert.equal(uploads, 1)
    f.onBoardShareCopied()
    f.closeBoardSharePanel()
    assert.equal(f.boardShareUrl.value, '')
    assert.deepEqual(f.events.map(x => x.name), [
      ANALYTICS_EVENTS.BOARD_SHARE_PANEL_OPENED,
      ANALYTICS_EVENTS.BOARD_SHARE_REQUESTED,
      ANALYTICS_EVENTS.BOARD_SHARE_CREATED,
      ANALYTICS_EVENTS.BOARD_SHARE_COPIED,
      ANALYTICS_EVENTS.BOARD_SHARE_PANEL_CLOSED,
    ])
    assert.deepEqual(f.events.at(-1).metadata, { outcome: 'created' })
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('snapshot failures report only the stage and allow retry after a failed request', async () => {
  const f = fixture({ document: new Error('Sensitive error detail') })
  f.openBoardSharePanel()
  await f.requestBoardShareLink()
  assert.equal(f.boardShareBusy.value, false)
  assert.equal(f.boardShareUrl.value, '')
  assert.equal(f.boardShareError.value, 'Finish editing before sharing this board.')
  assert.deepEqual(f.events.map(x => x.name), [
    ANALYTICS_EVENTS.BOARD_SHARE_PANEL_OPENED,
    ANALYTICS_EVENTS.BOARD_SHARE_REQUESTED,
    ANALYTICS_EVENTS.BOARD_SHARE_FAILED,
  ])
  assert.deepEqual(f.events.at(-1).metadata, { stage: 'snapshot' })
  assert.ok(!JSON.stringify(f.events).includes('Sensitive'))
  await f.requestBoardShareLink()
  assert.equal(f.captureCount(), 2)
  assert.equal(f.events.filter(x => x.name === ANALYTICS_EVENTS.BOARD_SHARE_REQUESTED).length, 2)
})

test('copy failure records copy-stage analytics and offers a manual copy fallback', () => {
  const f = fixture()
  f.openBoardSharePanel()
  f.onBoardShareCopyFailed()
  assert.equal(f.boardShareError.value, 'Could not copy the link. Select and copy it manually.')
  assert.deepEqual(f.events.at(-1), {
    name: ANALYTICS_EVENTS.BOARD_SHARE_FAILED, metadata: { stage: 'copy' },
  })
})
