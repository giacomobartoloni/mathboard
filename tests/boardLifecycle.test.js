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

test('a board transition invalidates old work before the first await and blocks new work', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const lifecycle = new BoardLifecycle()
  const old = lifecycle.capture()
  let finish
  const pending = lifecycle.transition(async (token) => {
    assert.equal(lifecycle.assertTransition(token), true)
    await new Promise(resolve => { finish = resolve })
  })

  assert.equal(lifecycle.isReady(), false)
  assert.equal(lifecycle.assertCurrent(old), false)
  assert.throws(() => lifecycle.capture())
  finish()
  await pending
  assert.equal(lifecycle.isReady(), true)
  assert.equal(lifecycle.assertCurrent(old), false)
  assert.equal(lifecycle.assertCurrent(lifecycle.capture()), true)
})

test('a failed transition releases the lock without reviving old work', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const lifecycle = new BoardLifecycle()
  const old = lifecycle.capture()
  await assert.rejects(() => lifecycle.transition(async () => { throw new Error('restore failed') }), /restore failed/)
  assert.equal(lifecycle.isReady(), true)
  assert.equal(lifecycle.assertCurrent(old), false)
})

test('teardown permanently invalidates pending work and cannot reopen after a transition', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const lifecycle = new BoardLifecycle()
  let finish
  const pending = lifecycle.transition(async () => new Promise(resolve => { finish = resolve }))
  lifecycle.dispose()
  finish()
  await pending
  assert.equal(lifecycle.isReady(), false)
  assert.throws(() => lifecycle.capture())
  await assert.rejects(() => lifecycle.transition(async () => {}))
})

test('a lifecycle state callback closes interaction before async transition work', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const states = []
  const lifecycle = new BoardLifecycle({ onReadyChanged: ready => states.push(ready) })
  let finish
  const pending = lifecycle.transition(async () => new Promise(resolve => { finish = resolve }))
  assert.deepEqual(states, [false])
  finish()
  await pending
  assert.deepEqual(states, [false, true])
  lifecycle.dispose()
  assert.deepEqual(states, [false, true, false])
})

test('a failing presentation callback cannot leave the lifecycle locked', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const lifecycle = new BoardLifecycle({ onReadyChanged: () => { throw new Error('canvas detached') } })
  await lifecycle.transition(async () => {})
  assert.equal(lifecycle.isReady(), true)
})

test('lifecycle subscribers receive transitions and can detach', async () => {
  const { BoardLifecycle } = await import('../src/board/BoardLifecycle.js')
  const lifecycle = new BoardLifecycle()
  const states = []
  const unsubscribe = lifecycle.subscribe((ready, epoch) => states.push({ ready, epoch }))
  await lifecycle.transition(async () => {})
  assert.deepEqual(states, [{ ready: false, epoch: 1 }, { ready: true, epoch: 2 }])
  unsubscribe()
  lifecycle.dispose()
  assert.equal(states.length, 2)
})
