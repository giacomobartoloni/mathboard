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
import test from 'node:test'
import { createDesktopEventSender } from '../src/analytics/desktopTransport.js'

const nextTick = () => new Promise((resolve) => setImmediate(resolve))

test('desktop analytics does not queue or invoke when offline', async () => {
  let called = false
  const sender = createDesktopEventSender(() => { called = true }, () => false)
  sender('object_created', { object_type: 'shape' })
  await nextTick()
  assert.equal(called, false)
})

test('desktop analytics transports event metadata without changing the payload', async () => {
  const actual = []
  const sender = createDesktopEventSender((event, metadata) => {
    actual.push({ event, metadata })
  }, () => true)

  sender('formula_submitted', { mode: 'create' })
  await nextTick()
  assert.deepEqual(actual, [{ event: 'formula_submitted', metadata: { mode: 'create' } }])
})

test('desktop analytics has a concurrency and backlog cap', async () => {
  let calls = 0
  const pending = []
  const sender = createDesktopEventSender(() => {
    calls += 1
    return new Promise((resolve) => { pending.push(resolve) })
  }, () => true)

  for (let index = 0; index < 200; index += 1) {
    sender('object_created', { object_type: 'path' })
  }
  await nextTick()
  assert.equal(calls, 4)

  for (const resolve of pending.splice(0)) resolve()
  await nextTick()
  assert.equal(calls, 8)

  // Drain the accepted backlog, and verify excess events were dropped.
  let previous = -1
  while (calls !== previous) {
    previous = calls
    for (const resolve of pending.splice(0)) resolve()
    await nextTick()
  }
  assert.equal(calls, 104)
})

test('desktop analytics swallows transport failures and discards stale queued events', async () => {
  let calls = 0
  const sender = createDesktopEventSender(() => {
    calls += 1
    return Promise.reject(new Error('offline'))
  }, () => true)

  for (let i = 0; i < 20; i += 1) sender('object_created', {})
  await nextTick()
  assert.equal(calls, 4)
})
