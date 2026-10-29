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
import { executeDesktopBoardCommand } from '../src/board/agent/desktop-commands.js'

function addressed(board) {
  board.getBoardId = () => 'mb_active'
  board.getBoardDocumentCommands = () => ({
    executeOnBoard: command => executeDesktopBoardCommand(board.getBoardController(), command),
  })
  return board
}

test('desktop bridge routes an addressed inactive request and echoes its board ID', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  const calls = []
  const routed = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: async command => {
      routed.push(command)
      return { boardId: command.boardId, objects: [] }
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      calls.push({ name, args })
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  assert.equal(calls[0].args.activeBoardId, 'mb_active')
  await onRequest({ payload: { requestId: 'r-1', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, boardId: 'mb_other', schemaVersion: 2,
    expiresAtMs: Date.now() + 10000, method: 'observe', params: {} } })
  assert.equal(routed.length, 1)
  assert.equal(routed[0].boardId, 'mb_other')
  const reply = JSON.parse(calls.find(call => call.name === 'board_bridge_reply').args.replyJson)
  assert.equal(reply.boardId, 'mb_other')
  assert.equal(reply.schemaVersion, 2)
  disconnect()
})

test('desktop bridge rejects absent and legacy board targets before dispatch', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  const calls = []
  let dispatched = 0
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: () => { dispatched += 1 } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => { calls.push({ name, args }); return 'app-1' },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  const request = { requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, schemaVersion: 2, expiresAtMs: Date.now() + 10000,
    method: 'create', params: { spec: { type: 'rect' } } }
  await onRequest({ payload: request })
  await onRequest({ payload: { ...request, requestId: 'r-2', boardId: 'mb_bad!', schemaVersion: 2 } })
  await onRequest({ payload: { ...request, requestId: 'r-3', boardId: 'mb_active', schemaVersion: 1 } })
  assert.equal(dispatched, 0)
  assert.equal(calls.filter(call => call.name === 'board_bridge_reply').length, 0)
  disconnect()
})

test('oversized result after an addressed write reports uncertain outcome', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let onRequest
  let replyJson
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: async () => ({ payload: 'x'.repeat(7 * 1024 * 1024) }) }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replyJson = args.replyJson
      return 'app-1'
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await onRequest({ payload: { requestId: 'r-1', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, boardId: 'mb_other', schemaVersion: 2,
    expiresAtMs: Date.now() + 10000, method: 'clear', params: {} } })
  assert.equal(JSON.parse(replyJson).error.code, 'execution_unknown')
  disconnect()
})

test('desktop bridge executes a correlated native observe and returns one bounded reply', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const calls = []
  let onRequest
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ observe: () => ({ stable: true, objects: [] }) }) })
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      calls.push({ name, args })
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })

  assert.equal(calls[0].name, 'board_bridge_state')
  await onRequest({ payload: { requestId: 'r-1', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2,
    expiresAtMs: Date.now() + 10_000, method: 'observe', params: {} } })
  const reply = calls.find(call => call.name === 'board_bridge_reply')
  assert.deepEqual(JSON.parse(reply.args.replyJson), {
    requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2, ok: true, result: { stable: true, objects: [] },
  })
  disconnect()
})

test('desktop bridge attaches capture tracking before native requests can run', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  let attachments = 0
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true })
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
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creations += 1 } }) })
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      calls.push({ name, args })
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await lifecycle.transition(async () => {})
  const envelope = { requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2, expiresAtMs: Date.now() + 10_000,
    params: { spec: { type: 'rect' } } }
  await onRequest({ payload: { ...envelope, method: 'create' } })
  await onRequest({ payload: { ...envelope, requestId: 'r-2', boardEpoch: 2, method: 'boards.hidden' } })

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
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true })
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
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creates += 1; return { id: 'new', type: 'rect' } } }) })
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  const payload = { requestId: 'r-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2, expiresAtMs: Date.now() + 10_000,
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
  const board = addressed({ _boardLifecycle: lifecycle, sessionReady: true,
    getBoardController: () => ({ create: () => { creations += 1; return { id: 'new', type: 'rect' } } }) })
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { if (event === 'mathboard-board-request') onRequest = handler; return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await onRequest({ payload: { requestId: 'expired', appGeneration: 'app-1',
    rendererGeneration: 'renderer-1', boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2,
    expiresAtMs: Date.now() - 1, method: 'create', params: { spec: { type: 'rect' } } } })

  assert.equal(creations, 0)
  assert.equal(replies[0].error.code, 'command_timeout')
  disconnect()
})

test('native cancellation epoch aborts an active read and suppresses its reply', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const handlers = new Map()
  const replies = []
  let finishRead
  let enteredRead
  const entered = new Promise(resolve => { enteredRead = resolve })
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: (_request, context) => {
      enteredRead(context)
      return new Promise(resolve => { finishRead = resolve })
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(args.replyJson)
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {} }),
  })
  const request = { requestId: 'mcp-1', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2, expiresAtMs: Date.now() + 10_000,
    method: 'observe', params: {}, cancellationEpoch: 1 }
  const handling = handlers.get('mathboard-board-request')({ payload: request })
  const context = await entered
  handlers.get('mathboard-board-cancel')({ payload: 1 })
  assert.equal(context.signal.aborted, false)
  handlers.get('mathboard-board-cancel')({ payload: 2 })
  assert.equal(context.signal.aborted, true)
  finishRead({ boardId: 'mb_active', objects: [] })
  await handling
  assert.equal(replies.length, 0)
  await handlers.get('mathboard-board-request')({ payload: { ...request, requestId: 'stale' } })
  assert.equal(replies.length, 0)
  disconnect()
})

test('an earlier cancellation event does not abort a request admitted in a newer epoch', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const handlers = new Map()
  const replies = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: async (_request, context) => {
      assert.equal(context.signal.aborted, false)
      return { boardId: 'mb_active', objects: [] }
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { handlers.set(event, handler); return () => handlers.delete(event) },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {} }),
  })
  handlers.get('mathboard-board-cancel')({ payload: 2 })
  await handlers.get('mathboard-board-request')({ payload: {
    requestId: 'new-epoch', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2, expiresAtMs: Date.now() + 10_000,
    method: 'observe', params: {}, cancellationEpoch: 2,
  } })
  assert.equal(replies.length, 1)
  disconnect()
})

test('generic cancellation works for non-MCP native requests and never cancels plain requests', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const handlers = new Map()
  const replies = []
  const entered = []
  const pending = []
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: (_request, context) => {
      entered.push(context)
      return new Promise(resolve => { pending.push(resolve) })
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { handlers.set(event, handler); return () => {} },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {} }),
  })
  const base = { appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2,
    expiresAtMs: Date.now() + 10_000, method: 'observe', params: {} }
  const first = handlers.get('mathboard-board-request')({
    payload: { ...base, requestId: 'generic-1', cancellationEpoch: 3 },
  })
  // Wait for the queued command to enter its handler.
  while (!entered.length) await Promise.resolve()
  assert.equal(entered[0].signal.aborted, false)
  handlers.get('mathboard-board-cancel')({ payload: 4 })
  assert.equal(entered[0].signal.aborted, true)
  pending[0]({ objects: ['discard-me'] })
  await first
  assert.equal(replies.length, 0)

  // An ordinary internal command carries no cancellation epoch and is unaffected.
  const second = handlers.get('mathboard-board-request')({
    payload: { ...base, requestId: 'ordinary-2' },
  })
  while (entered.length < 2) await Promise.resolve()
  assert.equal(entered[1].signal, undefined)
  handlers.get('mathboard-board-cancel')({ payload: 5 })
  pending[1]({ stable: true })
  await second
  assert.equal(replies.length, 1)
  assert.equal(replies[0].requestId, 'ordinary-2')

  // Malformed, stale and legacy-MCP-marked requests cannot bypass the generic epoch fence.
  await handlers.get('mathboard-board-request')({
    payload: { ...base, requestId: 'invalid-epoch', cancellationEpoch: -1 },
  })
  await handlers.get('mathboard-board-request')({
    payload: { ...base, requestId: 'stale-epoch', cancellationEpoch: 3 },
  })
  assert.equal(entered.length, 2)
  assert.equal(replies.length, 1)
  disconnect()
})

test('native cancellation ignores malformed events and applies to queued requests on disposal', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const handlers = new Map()
  const seen = []
  let finish
  const board = { _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardDocumentCommands: () => ({ executeOnBoard: (_request, context) => {
      seen.push(context.signal)
      return new Promise(resolve => { finish = resolve })
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => { handlers.set(event, handler); return () => {} },
    invokeCommand: async () => 'app-1',
    captureFactory: () => ({ attach() {}, dispose() {} }),
  })
  const handle = handlers.get('mathboard-board-request')({ payload: {
    requestId: 'native-one', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2,
    expiresAtMs: Date.now() + 10_000, method: 'observe', params: {}, cancellationEpoch: 0,
  } })
  while (!seen.length) await Promise.resolve()
  handlers.get('mathboard-board-cancel')({ payload: -1 })
  handlers.get('mathboard-board-cancel')({ payload: '2' })
  handlers.get('mathboard-board-cancel')({ payload: 0 })
  assert.equal(seen[0].aborted, false)
  disconnect()
  assert.equal(seen[0].aborted, true)
  finish({ stable: true })
  await handle
})

test('native board bridge routes library operations through the shared workspace contract', async () => {
  const { connectDesktopBoardBridge } = await import('../src/platform/desktopBoardBridge.js')
  const lifecycle = new BoardLifecycle()
  const replies = []
  let onRequest
  const board = {
    _boardLifecycle: lifecycle, sessionReady: true,
    getBoardId: () => 'mb_active',
    getBoardWorkspace: () => ({
      list: async () => [{ id: 'mb_active', title: 'Algebra', isActive: true }],
    }),
    getBoardDocumentCommands: () => ({ executeOnBoard: () => {
      throw new Error('Library commands must not use the document executor')
    } }),
  }
  const disconnect = await connectDesktopBoardBridge(() => board, {
    rendererGeneration: 'renderer-1',
    subscribe: async (event, handler) => {
      if (event === 'mathboard-board-request') onRequest = handler
      return () => {}
    },
    invokeCommand: async (name, args) => {
      if (name === 'board_bridge_reply') replies.push(JSON.parse(args.replyJson))
      return name === 'board_bridge_state' ? 'app-1' : undefined
    },
    captureFactory: () => ({ attach() {}, dispose() {}, beginMutation: () => () => {} }),
  })
  await onRequest({ payload: {
    requestId: 'library-list', appGeneration: 'app-1', rendererGeneration: 'renderer-1',
    boardEpoch: 0, boardId: 'mb_active', schemaVersion: 2,
    expiresAtMs: Date.now() + 10_000, method: 'boards.list', params: {},
  } })
  assert.equal(replies.length, 1)
  assert.equal(replies[0].ok, true)
  assert.deepEqual(replies[0].result, [{ id: 'mb_active', title: 'Algebra', isActive: true }])
  disconnect()
})
