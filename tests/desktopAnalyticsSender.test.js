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
import { createDesktopEventSender } from '../src/analytics/transports/desktopSender.js'
import { createDesktopAnalyticsTransport } from '../src/analytics/transports/desktop.js'

const nextTurn = () => new Promise((resolve) => setImmediate(resolve))

test('desktop transport forwards the event without WebView-provided globals', async () => {
  const calls = []
  const transport = createDesktopAnalyticsTransport({
    invokeCommand: (command, args) => { calls.push({ command, args }); return Promise.resolve() },
    isOnline: () => true,
    doNotTrack: () => false,
  })
  transport.track('object_created', { object_type: 'shape' })
  await nextTurn()
  assert.deepEqual(calls, [{
    command: 'track_desktop_analytics',
    args: { event: 'object_created', metadata: { object_type: 'shape' } },
  }])
})

test('offline and DNT signals drop events before native invocation', async () => {
  const calls = []
  let online = false
  let dnt = false
  const sender = createDesktopEventSender({
    send: (name) => calls.push(name),
    isOnline: () => online,
    doNotTrack: () => dnt,
  })
  sender('offline', {})
  online = true
  dnt = true
  sender('dnt', {})
  dnt = false
  sender('allowed', {})
  await nextTurn()
  assert.deepEqual(calls, ['allowed'])
})

test('default DNT reader checks both exposed WebView signals independently', async () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    for (const [navigatorDnt, windowDnt, expectedCalls] of [
      [undefined, undefined, 1],
      ['0', undefined, 1],
      ['1', undefined, 0],
      [undefined, 'yes', 0],
      ['0', '1', 0],
      ['yes', '0', 0],
    ]) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true, value: { doNotTrack: navigatorDnt },
      })
      Object.defineProperty(globalThis, 'window', {
        configurable: true, value: { doNotTrack: windowDnt },
      })
      const calls = []
      const sender = createDesktopEventSender({
        send: (name) => calls.push(name),
        isOnline: () => true,
      })
      sender('object_created', {})
      await nextTurn()
      assert.equal(calls.length, expectedCalls, `${navigatorDnt}/${windowDnt}`)
    }
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else delete globalThis.navigator
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else delete globalThis.window
  }
})

test('desktop sender limits active invokes to four and pending events to 100', async () => {
  let calls = 0
  const pending = []
  const sender = createDesktopEventSender({
    send: () => { calls += 1; return new Promise((resolve) => pending.push(resolve)) },
    isOnline: () => true,
    doNotTrack: () => false,
  })
  for (let index = 0; index < 200; index += 1) sender('object_created', { object_type: 'path' })
  await nextTurn()
  assert.equal(calls, 4)

  let previous = -1
  while (calls !== previous) {
    previous = calls
    for (const resolve of pending.splice(0)) resolve()
    await nextTurn()
  }
  assert.equal(calls, 104)
})

test('native rejection drops buffered work and never rejects an editor action', async () => {
  let calls = 0
  const sender = createDesktopEventSender({
    send: () => { calls += 1; return Promise.reject(new Error('offline')) },
    isOnline: () => true,
    doNotTrack: () => false,
  })
  for (let index = 0; index < 20; index += 1) {
    assert.equal(sender('object_created', {}), undefined)
  }
  await nextTurn()
  assert.equal(calls, 4)
})

test('a DNT change discards waiting events before another native invoke', async () => {
  const pending = []
  let calls = 0
  let dnt = false
  const sender = createDesktopEventSender({
    send: () => { calls += 1; return new Promise((resolve) => pending.push(resolve)) },
    isOnline: () => true,
    doNotTrack: () => dnt,
  })
  for (let index = 0; index < 8; index += 1) sender('object_created', {})
  await nextTurn()
  assert.equal(calls, 4)
  dnt = true
  for (const resolve of pending.splice(0)) resolve()
  await nextTurn()
  assert.equal(calls, 4)
  dnt = false
  sender('object_created', {})
  await nextTurn()
  assert.equal(calls, 5)
})
