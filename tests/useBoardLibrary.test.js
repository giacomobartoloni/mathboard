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
