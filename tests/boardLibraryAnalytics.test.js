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
import { createBoardLibraryAnalytics } from '../src/analytics/boardLibrary.js'
import { ANALYTICS_EVENTS } from '../src/analytics/events.js'

function recording() {
  const events = []
  const analytics = createBoardLibraryAnalytics((name, metadata) => events.push({ name, metadata }))
  return { analytics, events }
}

test('open, close, pin and resize use fixed UX categories', () => {
  const { analytics, events } = recording()
  analytics.opened()
  analytics.modeChanged('pinned', 'user')
  analytics.modeChanged('overlay', 'viewport')
  analytics.closed('overlay', 'escape')
  assert.deepEqual(events, [
    { name: ANALYTICS_EVENTS.LIBRARY_OPENED, metadata: { library: 'boards' } },
    { name: ANALYTICS_EVENTS.LIBRARY_MODE_CHANGED, metadata: { library: 'boards', mode: 'pinned', reason: 'user' } },
    { name: ANALYTICS_EVENTS.LIBRARY_MODE_CHANGED, metadata: { library: 'boards', mode: 'overlay', reason: 'viewport' } },
    { name: ANALYTICS_EVENTS.LIBRARY_CLOSED, metadata: { library: 'boards', mode: 'overlay', reason: 'escape' } },
  ])
})

test('browsing and board action outcomes use only finite allowlists', () => {
  const { analytics, events } = recording()
  for (const action of ['search', 'recent', 'archived']) analytics.browsed(action)
  analytics.actionFinished('create', 'success', 'overlay')
  analytics.actionFinished('unarchive-open', 'failure', 'pinned')
  analytics.actionFinished('delete', 'success', 'pinned')
  assert.deepEqual(events, [
    ...['search', 'recent', 'archived'].map(action => ({
      name: ANALYTICS_EVENTS.LIBRARY_BROWSED, metadata: { library: 'boards', action },
    })),
    { name: ANALYTICS_EVENTS.LIBRARY_ACTION, metadata: { library: 'boards', action: 'create', outcome: 'success', mode: 'overlay' } },
    { name: ANALYTICS_EVENTS.LIBRARY_ACTION, metadata: { library: 'boards', action: 'unarchive_open', outcome: 'failure', mode: 'pinned' } },
    { name: ANALYTICS_EVENTS.LIBRARY_ACTION, metadata: { library: 'boards', action: 'delete', outcome: 'success', mode: 'pinned' } },
  ])
})

test('unknown values and arbitrary content never reach analytics metadata', () => {
  const { analytics, events } = recording()
  analytics.closed('private board', 'escape')
  analytics.closed('pinned', 'private reason')
  analytics.modeChanged('private mode', 'user')
  analytics.browsed('sensitive search value')
  analytics.actionFinished('private action', 'success', 'overlay')
  analytics.actionFinished('create', 'private outcome', 'overlay')
  analytics.actionFinished('create', 'success', 'private mode')
  analytics.actionFinished('__proto__', 'success', 'overlay')
  assert.deepEqual(events, [])
})

test('provider errors do not alter library interaction flow', () => {
  const analytics = createBoardLibraryAnalytics(() => { throw new Error('offline') })
  assert.doesNotThrow(() => {
    analytics.opened()
    analytics.browsed('search')
    analytics.modeChanged('pinned', 'user')
    analytics.actionFinished('create', 'failure', 'pinned')
    analytics.closed('pinned', 'close_button')
  })
})
