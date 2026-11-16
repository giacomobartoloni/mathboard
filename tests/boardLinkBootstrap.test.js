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
import { useBoardLinkBootstrap } from '../src/composables/useBoardLinkBootstrap.js'
import { encryptSharedBoard } from '../src/share/boardShare.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'
import { ANALYTICS_EVENTS, ANALYTICS_STAMP_SHARE_FAILURE_STAGES } from '../src/analytics/events.js'

if (!globalThis.crypto) globalThis.crypto = webcrypto

function fakeLocation(url) {
  const previousWindow = globalThis.window
  const previousHistory = globalThis.history
  const window = { location: new URL(url) }
  const history = {
    replaceState(_state, _unused, path) {
      window.location = new URL(path, window.location.origin)
    },
  }
  window.history = history
  globalThis.window = window
  globalThis.history = history
  return () => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousHistory === undefined) delete globalThis.history
    else globalThis.history = previousHistory
  }
}

function fixture(board) {
  const events = []
  const boardError = { value: null }
  const selectedTool = { value: 'pen' }
  let initialized = false
  let analyticsSawShareKey = false
  const bootstrap = useBoardLinkBootstrap({
    drawBoardRef: { value: board },
    boardError,
    selectedTool,
    desktopRuntime: false,
    waitForBoardReady: async () => true,
    trackEvent: (name, metadata) => events.push({ name, metadata }),
    initializeAnalytics: () => {
      initialized = true
      analyticsSawShareKey = window.location.hash.includes('b=')
    },
  })
  return { ...bootstrap, events, boardError, selectedTool,
    analyticsInitialized: () => initialized,
    analyticsSawShareKey: () => analyticsSawShareKey,
  }
}

test('Stamp URL bootstraps using its existing operation and cleans up the URL', async () => {
  const restore = fakeLocation('https://mathboard.app/#s=encoded-stamp')
  try {
    const imported = []
    const f = fixture({ bootstrapFromStamp: async payload => { imported.push(payload); return { ok: true } } })
    assert.equal(await f.bootstrapStampFromUrl(), true)
    assert.deepEqual(imported, ['encoded-stamp'])
    assert.equal(f.selectedTool.value, 'select')
    assert.equal(window.location.hash, '')
    assert.deepEqual(f.events.map(event => event.name), [ANALYTICS_EVENTS.STAMP_SHARE_OPENED])
    assert.equal(f.analyticsInitialized(), false)
  } finally { restore() }
})

test('Stamp failure reports the established analytics stage and still clears the link', async () => {
  const restore = fakeLocation('https://mathboard.app/#s=bad-stamp')
  try {
    const f = fixture({ bootstrapFromStamp: async () => ({ ok: false, message: 'Unsupported stamp.' }) })
    assert.equal(await f.bootstrapStampFromUrl(), false)
    assert.equal(f.boardError.value, 'Unsupported stamp.')
    assert.equal(f.events[0].name, ANALYTICS_EVENTS.STAMP_SHARE_FAILED)
    assert.deepEqual(f.events[0].metadata, { stage: ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN })
    assert.equal(window.location.hash, '')
  } finally { restore() }
})

test('Board link opens an independent document and clears key before analytics initialization', async () => {
  const board = createEmptyBoardDocument('Class')
  const { bytes, key } = await encryptSharedBoard(board)
  const restoreLocation = fakeLocation(`https://mathboard.app/#b=${'A'.repeat(22)},${key}`)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(bytes, { status: 200 })
  try {
    const imported = []
    const f = fixture({ bootstrapSharedBoard: async document => { imported.push(document) } })
    assert.equal(await f.bootstrapSharedBoardFromUrl(), true)
    assert.deepEqual(imported, [board])
    assert.equal(f.selectedTool.value, 'select')
    assert.equal(window.location.hash, '')
    assert.equal(f.analyticsInitialized(), true)
    assert.equal(f.analyticsSawShareKey(), false)
    assert.deepEqual(f.events.map(event => event.name), [ANALYTICS_EVENTS.BOARD_SHARE_OPENED])
  } finally {
    globalThis.fetch = originalFetch
    restoreLocation()
  }
})

test('Board import failure reports only its stage and never leaves a key in the URL', async () => {
  const board = createEmptyBoardDocument('Class')
  const { bytes, key } = await encryptSharedBoard(board)
  const restoreLocation = fakeLocation(`https://mathboard.app/#b=${'A'.repeat(22)},${key}`)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(bytes, { status: 200 })
  try {
    const f = fixture({ bootstrapSharedBoard: async () => { throw new Error('Storage error') } })
    assert.equal(await f.bootstrapSharedBoardFromUrl(), false)
    assert.equal(f.events[0].name, ANALYTICS_EVENTS.BOARD_SHARE_FAILED)
    assert.deepEqual(f.events[0].metadata, { stage: 'import' })
    assert.equal(window.location.hash, '')
    assert.equal(f.analyticsInitialized(), true)
    assert.equal(f.analyticsSawShareKey(), false)
    assert.equal(f.boardError.value, 'Could not create a local board from this link.')
  } finally {
    globalThis.fetch = originalFetch
    restoreLocation()
  }
})
