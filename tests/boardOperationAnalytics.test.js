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
import { createBoardOperationAnalytics } from '../src/board/analytics/BoardOperationAnalytics.js'

function setup() {
  const calls = []
  const analytics = createBoardOperationAnalytics({
    trackEvent: (name, metadata) => calls.push(['event', name, metadata]),
    trackBoardEngaged: () => calls.push(['engaged']),
    recordProductAction: () => calls.push(['action']),
  })
  return { calls, analytics }
}

test('one UI creation preserves engagement, milestone and event order', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'create', objectKinds: ['shape'], shape: 'rectangle' }, { interactionChannel: 'ui' })
  assert.deepEqual(calls, [
    ['engaged'],
    ['action'],
    ['event', 'object_created', { object_type: 'shape', shape: 'rectangle' }],
  ])
})

test('a local-agent batch produces one categorical event without human milestones', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'create', objectKinds: ['shape', 'text', 'formula'] }, { interactionChannel: 'local_agent' })
  assert.deepEqual(calls, [['event', 'object_created', { object_type: 'mixed' }]])
})

test('deletion metadata counts semantic roots once and keeps every fixed count field', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'delete', objectKinds: ['formula', 'group', 'path'] }, { interactionChannel: 'ui' })
  assert.deepEqual(calls, [
    ['engaged'], ['action'],
    ['event', 'object_deleted', {
      selection_count: 3, object_type: 'mixed', path_count: 1, shape_count: 0,
      text_count: 0, formula_count: 1, group_count: 1, unknown_count: 0,
    }],
  ])
})

test('formula edits and UI grouping keep existing interaction behavior', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'formula_edit' }, { interactionChannel: 'ui' })
  analytics.record({ kind: 'group' }, { interactionChannel: 'ui' })
  analytics.record({ kind: 'update' }, { interactionChannel: 'ui' })
  assert.deepEqual(calls, [
    ['engaged'], ['action'], ['event', 'formula_edited', undefined],
    ['engaged'], ['action'],
  ])
})

test('undo, redo and later text edits emit only their established events', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'undo', commandType: 'add' }, { interactionChannel: 'ui' })
  analytics.record({ kind: 'redo', commandType: 'replace' }, { interactionChannel: 'ui' })
  analytics.record({ kind: 'text_edit' }, { interactionChannel: 'ui' })
  assert.deepEqual(calls, [
    ['event', 'undo_used', { command_type: 'add' }],
    ['event', 'redo_used', { command_type: 'replace' }],
    ['event', 'text_edited', undefined],
  ])
})

test('untrusted fields and values cannot escape into provider metadata', () => {
  const { analytics, calls } = setup()
  analytics.record({ kind: 'create', objectKinds: ['secret: latex=x^2'], shape: 'private-text', secret: 'private-text' },
    { interactionChannel: 'mcp', secret: 'private-text' })
  analytics.record({ kind: 'undo', commandType: 'private-text' }, { interactionChannel: 'mcp' })
  analytics.record({ kind: 'create', objectKinds: ['text'] }, { interactionChannel: 'untrusted' })
  assert.deepEqual(calls, [['event', 'object_created', { object_type: 'unknown' }]])
})

test('a failing analytics dependency cannot interrupt the editor operation', () => {
  const analytics = createBoardOperationAnalytics({
    trackEvent: () => { throw new Error('offline') },
    trackBoardEngaged: () => { throw new Error('offline') },
    recordProductAction: () => { throw new Error('offline') },
  })
  assert.doesNotThrow(() => analytics.record({ kind: 'create', objectKinds: ['path'] }, { interactionChannel: 'ui' }))
})

test('only UI commits advance the injected 5/20/50 human action milestones', () => {
  const events = []
  let engaged = false
  let actions = 0
  const analytics = createBoardOperationAnalytics({
    trackEvent: (name, metadata) => events.push({ name, metadata }),
    trackBoardEngaged: () => {
      if (!engaged) {
        engaged = true
        events.push({ name: 'board_engaged' })
      }
    },
    recordProductAction: () => {
      actions += 1
      if ([5, 20, 50].includes(actions)) events.push({ name: 'usage_milestone', metadata: { actions } })
    },
  })
  for (let index = 0; index < 50; index += 1) {
    analytics.record({ kind: 'create', objectKinds: ['path'] }, { interactionChannel: 'ui' })
    if (index === 3) {
      analytics.record({ kind: 'create', objectKinds: ['path'] }, { interactionChannel: 'local_agent' })
    }
  }
  assert.equal(actions, 50)
  assert.equal(events.filter(({ name }) => name === 'board_engaged').length, 1)
  assert.equal(events.filter(({ name }) => name === 'object_created').length, 51)
  assert.deepEqual(events.filter(({ name }) => name === 'usage_milestone').map(({ metadata }) => metadata.actions), [5, 20, 50])
  assert.deepEqual(events.slice(0, 3), [
    { name: 'board_engaged' },
    { name: 'object_created', metadata: { object_type: 'path' } },
    { name: 'object_created', metadata: { object_type: 'path' } },
  ])
})
