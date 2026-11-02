/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopUpdateDiscovery, UPDATE_CHECK_INTERVAL_MS } from '../src/platform/desktopUpdates.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('startup checks silently and repeats every 24 hours without downloading', async () => {
  let scheduled
  let cleared
  let checks = 0
  const updates = createDesktopUpdateDiscovery({
    fetchUpdate: async () => {
      checks += 1
      return { installedVersion: '1.8.0', latestVersion: '1.9.0', releaseUrl: 'https://github.com/giacomobartoloni/mathboard/releases/tag/v1.9.0' }
    },
    schedule: (fn, delay) => { scheduled = fn; assert.equal(delay, UPDATE_CHECK_INTERVAL_MS); return 11 },
    unschedule: (id) => { cleared = id },
  })
  updates.start()
  await new Promise(setImmediate)
  assert.equal(updates.snapshot().state, 'available')
  await scheduled()
  await new Promise(setImmediate)
  assert.equal(checks, 2)
  updates.dispose()
  assert.equal(cleared, 11)
  scheduled()
  assert.equal(checks, 2)
})

test('manual checks report up-to-date and errors while background errors stay quiet', async () => {
  let fail = true
  const updates = createDesktopUpdateDiscovery({
    fetchUpdate: async () => {
      if (fail) throw new Error('offline')
      return { installedVersion: '1.9.0', latestVersion: null, releaseUrl: null }
    },
    schedule: () => 1,
    unschedule: () => {},
  })
  updates.start()
  await new Promise(setImmediate)
  assert.equal(updates.snapshot().state, 'idle')
  await updates.check()
  assert.equal(updates.snapshot().state, 'error')
  fail = false
  await updates.check()
  assert.deepEqual(updates.snapshot(), { state: 'up-to-date', installedVersion: '1.9.0' })
  updates.dispose()
})

test('a manual request during a background check shares the request and shows its result', async () => {
  const request = deferred()
  let calls = 0
  const updates = createDesktopUpdateDiscovery({
    fetchUpdate: () => { calls++; return request.promise },
    schedule: () => 1,
    unschedule: () => {},
  })
  updates.start()
  const pending = updates.check()
  assert.equal(updates.snapshot().state, 'checking')
  request.resolve({ installedVersion: '1.9.0', latestVersion: null, releaseUrl: null })
  await pending
  assert.equal(calls, 1)
  assert.equal(updates.snapshot().state, 'up-to-date')
  updates.dispose()
})

test('disposed discovery ignores late responses', async () => {
  const request = deferred()
  const updates = createDesktopUpdateDiscovery({
    fetchUpdate: () => request.promise,
    schedule: () => 1,
    unschedule: () => {},
  })
  const pending = updates.check()
  updates.dispose()
  request.resolve({ installedVersion: '1.8.0', latestVersion: '1.9.0', releaseUrl: 'https://example.test' })
  await pending
  assert.equal(updates.snapshot().state, 'checking')
})
