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
import { BoardLifecycle } from '../src/board/BoardLifecycle.js'

test('desktop bridge executes a correlated native observe and returns one bounded reply', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const calls = []
  let onRequest
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ observe: () => ({ stable: true, objects: [] }) }) }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (_event, handler) => { onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      calls.push({ name, args })
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })

  assert.equal(calls[0].name, 'board_bridge_state')
  await onRequest({ payload: { requestId: 'r-1', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, schemaVersion: 1,
    expiresAtMs: Date.now() + 10_000, method: 'observe', params: {} } })
  const reply = calls.find(call => call.name === 'board_bridge_reply')
  assert.deepEqual(JSON.parse(reply.args.replyJson), {
    requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, schemaVersion: 1, ok: true, result: { stable: true, objects: [] },
  })
  disconnect()
})

test('desktop bridge attaches capture tracking before native requests can run', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let attachments = 0
  const board = { _boardLifecycle: lifecycle, sessionReady: true }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async () => () => {},
    invokeCommand: async () => 'app-1',
    captureFactory: () => ({
      attach() { attachments += 1 },
      dispose() {},
      beginMutation: () => () => {},
    }),
  })

  assert.equal(attachments, 1)
  disconnect()
})

test('desktop bridge never executes a stale or excluded board command', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  let creations = 0
  const calls = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creations += 1 } }) }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (_event, handler) => { onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      calls.push({ name, args })
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await lifecycle.transition(async () => {})
  const envelope = { requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, schemaVersion: 1, expiresAtMs: Date.now() + 10_000,
    params: { spec: { type: 'rect' } } }
  await onRequest({ payload: { ...envelope, method: 'create' } })
  await onRequest({ payload: { ...envelope, requestId: 'r-2', boardEpoch: 2, method: 'boards.list' } })

  assert.equal(creations, 0)
  const replies = calls.filter(call => call.name === 'board_bridge_reply')
    .map(call => JSON.parse(call.args.replyJson))
  assert.equal(replies.length, 2)
  assert.deepEqual(replies.map(reply => reply.error.code), ['board_not_ready', 'invalid_command'])
  disconnect()
})

test('desktop bridge reports failed native registration and removes its listener', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let unlistened = false
  const board = { _boardLifecycle: lifecycle, sessionReady: true }
  await assert.rejects(() => connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async () => () => { unlistened = true },
    invokeCommand: async () => { throw new Error('native unavailable') },
    captureFactory: () => ({ attach() {}, dispose() {} }),
  }), /native unavailable/)
  assert.equal(unlistened, true)
})

test('a repeated native request ID never executes a write twice', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  let creates = 0
  const replies = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creates += 1; return { id: 'new', type: 'rect' } } }) }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (_event, handler) => { onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  const payload = { requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, schemaVersion: 1, expiresAtMs: Date.now() + 10_000,
    method: 'create', params: { spec: { type: 'rect' } } }
  await Promise.all([onRequest({ payload }), onRequest({ payload })])

  assert.equal(creates, 1)
  assert.equal(replies.length, 1)
  disconnect()
})

test('an expired queued request is rejected before any board mutation', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  let creations = 0
  const replies = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creations += 1; return { id: 'new', type: 'rect' } } }) }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (_event, handler) => { onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await onRequest({ payload: { requestId: 'expired', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, schemaVersion: 1,
    expiresAtMs: Date.now() - 1, method: 'create', params: { spec: { type: 'rect' } } } })

  assert.equal(creations, 0)
  assert.equal(replies[0].error.code, 'command_timeout')
  disconnect()
})
