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
import { ref } from 'vue'
import { useBoardLibrary } from '../src/composables/useBoardLibrary.js'
import { ANALYTICS_EVENTS } from '../src/analytics/events.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'

function harness({ mode = 'closed', boards = [], overrides = {} } = {}) {
  const events = []
  const calls = []
  const sidebar = {
    mode: ref(mode),
    isOpen: ref(mode !== 'closed'),
    open() { this.mode.value = 'overlay'; this.isOpen.value = true },
    dismiss(reason) {
      const previous = this.mode.value
      this.mode.value = 'closed'
      this.isOpen.value = false
      library.onSidebarClosed(previous, reason)
    },
  }
  let resets = 0
  const workspace = {
    list: async () => boards,
    listArchived: async () => [],
    archive: async (params) => { calls.push(['archive', params]) },
    rename: async (params) => { calls.push(['rename', params]) },
    unarchive: async (params) => { calls.push(['unarchive', params]) },
    open: async (params) => { calls.push(['open', params]) },
    ...overrides,
  }
  const library = useBoardLibrary({
    isReady: ref(true),
    getWorkspace: () => workspace,
    getSidebar: () => sidebar,
    resetSelectedTool: () => { resets++ },
    trackEvent: (event, metadata) => events.push({ event, metadata }),
  })
  return { library, sidebar, calls, events, resets: () => resets }
}

test('opening reads lists and emits a single opening signal', async () => {
  const { library, sidebar, events } = harness({ boards: [{ id: 'a' }] })
  await library.openBoardLibrary()
  await library.openBoardLibrary()
  assert.equal(sidebar.mode.value, 'overlay')
  assert.equal(library.boardList.value[0].id, 'a')
  assert.equal(library.boardLibraryLoading.value, false)
  assert.deepEqual(events.map(x => x.event), [ANALYTICS_EVENTS.LIBRARY_OPENED])
})

test('archiving an active board dismisses overlay and resets the tool once', async () => {
  const { library, sidebar, calls, events, resets } = harness({ boards: [{ id: 'a', isActive: true }] })
  await library.openBoardLibrary()
  await library.onBoardLibraryAction({ action: 'archive', boardId: 'a' })
  assert.deepEqual(calls, [['archive', { boardId: 'a' }]])
  assert.equal(resets(), 1)
  assert.equal(sidebar.mode.value, 'closed')
  assert.deepEqual(events.slice(-2).map(x => x.event), [
    ANALYTICS_EVENTS.LIBRARY_ACTION, ANALYTICS_EVENTS.LIBRARY_CLOSED,
  ])
  assert.equal(events[1].metadata.outcome, 'success')
})

test('failed restored-board opening preserves error and records failure', async () => {
  const { library, sidebar, events } = harness({
    mode: 'overlay',
    overrides: { open: async () => { throw new Error('Storage unavailable') } },
  })
  await library.onBoardLibraryAction({ action: 'unarchive-open', boardId: 'old' })
  assert.match(library.boardLibraryError.value, /Board restored but could not be opened/)
  assert.equal(library.boardLibraryBusy.value, false)
  assert.equal(sidebar.mode.value, 'overlay')
  assert.equal(events[0].metadata.outcome, 'failure')
  assert.equal(events[0].metadata.action, 'unarchive_open')
})

const sampleFile = (name, document) => {
  const body = JSON.stringify(document)
  return { name, size: new TextEncoder().encode(body).length, text: async () => body }
}

test('import uses the shared BoardDocument copy path and closes overlay', async () => {
  const doc = createEmptyBoardDocument('Imported')
  const { library, sidebar, calls, events, resets } = harness({
    mode: 'overlay',
    overrides: { importBoard: async ({ document }) => { calls.push(['import', document]) } },
  })
  await library.onBoardLibraryAction({ action: 'import', files: [sampleFile('lesson.mathboard', doc)] })
  assert.deepEqual(calls, [['import', doc]])
  assert.equal(library.boardLibraryError.value, null)
  assert.equal(resets(), 1)
  assert.equal(sidebar.mode.value, 'closed')
  assert.deepEqual(events.filter(x => x.event === ANALYTICS_EVENTS.LIBRARY_ACTION).map(x => x.metadata), [
    { library: 'boards', action: 'import', outcome: 'success', mode: 'overlay' },
  ])
})

test('invalid import does not call workspace and exposes a safe failure', async () => {
  const { library, sidebar, calls, events } = harness({ mode: 'overlay' })
  await library.onBoardLibraryAction({ action: 'import', files: [{
    name: 'broken.mathboard', size: 20, text: async () => '{private expression',
  }] })
  assert.deepEqual(calls, [])
  assert.equal(sidebar.mode.value, 'overlay')
  assert.match(library.boardLibraryError.value, /not a valid MathBoard board/)
  assert.ok(!JSON.stringify(events).includes('private expression'))
  assert.equal(events[0].metadata.action, 'import')
  assert.equal(events[0].metadata.outcome, 'failure')
  assert.equal(library.boardLibraryBusy.value, false)
})

test('pinned import keeps the library open and does not expose document metadata in analytics', async () => {
  const doc = createEmptyBoardDocument('Confidential mathematics')
  const { library, sidebar, events, resets } = harness({
    mode: 'pinned',
    overrides: { importBoard: async () => {} },
  })
  await library.onBoardLibraryAction({ action: 'import', files: [sampleFile('confidential.mathboard', doc)] })
  assert.equal(sidebar.mode.value, 'pinned')
  assert.equal(resets(), 1)
  assert.ok(!JSON.stringify(events).includes('Confidential'))
  assert.deepEqual(events.filter(x => x.event === ANALYTICS_EVENTS.LIBRARY_ACTION).map(x => x.metadata.outcome), ['success'])
})
