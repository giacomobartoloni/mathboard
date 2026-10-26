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

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { createVisualCaptureAdapter } from '../board/capture/visual-capture.js'
import { boardCommandMutatesBoard } from '../board/agent/command-registry.js'
import { executeDesktopBoardCommand, getDesktopBoardMethods } from '../board/agent/desktop-commands.js'

const SCHEMA_VERSION = 1
const MAX_REPLY_BYTES = 7 * 1024 * 1024
const MAX_COMMAND_LIFETIME_MS = 10000
const allowed = new Set(getDesktopBoardMethods())
const safeCodes = new Set([
  'board_not_ready', 'invalid_object_spec', 'invalid_object_patch', 'object_not_found',
  'nested_object_mutation_not_supported', 'formula_render_failed', 'board_commit_failed',
  'invalid_capture_request', 'capture_too_large', 'capture_failed',
])

function safeError(error) {
  return { code: safeCodes.has(error?.code) ? error.code : 'board_bridge_error',
    message: 'Board command could not be completed.' }
}

function validEnvelope(request, appGeneration, rendererGeneration) {
  return request && typeof request === 'object'
    && typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 128
    && request.appGeneration === appGeneration
    && request.rendererGeneration === rendererGeneration
    && request.schemaVersion === SCHEMA_VERSION
    && Number.isSafeInteger(request.boardEpoch)
    && request.boardEpoch >= 0
    && Number.isSafeInteger(request.expiresAtMs)
    && request.expiresAtMs <= Date.now() + MAX_COMMAND_LIFETIME_MS + 1000
    && request.params && Object.getPrototypeOf(request.params) === Object.prototype
}

/** Registers a reply-only WebView adapter. Native code alone starts requests. */
export async function connectDesktopBoardBridge(getBoard, {
  rendererGeneration = globalThis.crypto.randomUUID(),
  subscribe = listen,
  invokeCommand = invoke,
  captureFactory = createVisualCaptureAdapter,
} = {}) {
  const board = getBoard()
  const lifecycle = board?._boardLifecycle
  if (!board?.sessionReady || !lifecycle?.isReady()) throw new Error('Board is not ready for desktop bridge.')
  const capture = captureFactory(getBoard)
  let disposed = false
  let appGeneration = null
  let stateQueue = Promise.resolve()
  let commandQueue = Promise.resolve()
  const seenRequestIds = new Set()

  const publishState = (ready, epoch) => {
    const task = stateQueue.then(async () => {
      if (disposed) return
      const generation = await invokeCommand('board_bridge_state', {
        rendererGeneration, boardEpoch: epoch, ready,
      })
      if (appGeneration && appGeneration !== generation) throw new Error('Desktop app generation changed.')
      appGeneration = generation
    })
    stateQueue = task.catch(() => {})
    return task
  }

  const unsubscribeLifecycle = lifecycle.subscribe((ready, epoch) => {
    void publishState(ready, epoch).catch(() => {})
  })
  const handleRequest = async (request) => {
    if (disposed || !validEnvelope(request, appGeneration, rendererGeneration)) return
    const reply = { requestId: request.requestId, appGeneration,
      rendererGeneration, boardEpoch: request.boardEpoch, schemaVersion: SCHEMA_VERSION }
    if (!allowed.has(request.method)) {
      reply.ok = false
      reply.error = { code: 'invalid_command', message: 'Unsupported board command.' }
    } else if (Date.now() >= request.expiresAtMs) {
      reply.ok = false
      reply.error = { code: 'command_timeout', message: 'Board command expired before execution.' }
    } else if (getBoard() !== board || !lifecycle.isReady() || request.boardEpoch !== lifecycle.epoch) {
      reply.ok = false
      reply.error = { code: 'board_not_ready', message: 'Board changed before execution.' }
    } else {
      const finish = boardCommandMutatesBoard(request.method) ? capture.beginMutation() : () => {}
      try {
        reply.result = await executeDesktopBoardCommand(board.getBoardController(), request, capture)
        reply.ok = true
      } catch (error) {
        reply.ok = false
        reply.error = safeError(error)
      } finally {
        finish()
      }
    }
    if (disposed) return
    let replyJson = JSON.stringify(reply)
    if (new TextEncoder().encode(replyJson).length > MAX_REPLY_BYTES) {
      replyJson = JSON.stringify({ requestId: request.requestId, appGeneration,
        rendererGeneration, boardEpoch: request.boardEpoch, schemaVersion: SCHEMA_VERSION,
        ok: false, error: { code: 'capture_too_large', message: 'Board result exceeds the limit.' } })
    }
    try { await invokeCommand('board_bridge_reply', { replyJson }) } catch {
      // Native timeout/revocation may have removed this request already.
    }
  }
  const onRequest = ({ payload }) => {
    if (!validEnvelope(payload, appGeneration, rendererGeneration)) return commandQueue
    if (seenRequestIds.has(payload.requestId)) return commandQueue
    seenRequestIds.add(payload.requestId)
    if (seenRequestIds.size > 256) seenRequestIds.delete(seenRequestIds.values().next().value)
    commandQueue = commandQueue.then(() => handleRequest(payload)).catch(() => {})
    return commandQueue
  }

  let unlisten
  try {
    unlisten = await subscribe('mathboard-board-request', onRequest)
    await publishState(lifecycle.isReady(), lifecycle.epoch)
  } catch (error) {
    disposed = true
    unsubscribeLifecycle()
    unlisten?.()
    capture.dispose()
    throw error
  }

  return () => {
    if (disposed) return
    disposed = true
    unsubscribeLifecycle()
    unlisten()
    capture.dispose()
    void invokeCommand('board_bridge_state', {
      rendererGeneration, boardEpoch: lifecycle.epoch, ready: false,
    }).catch(() => {})
  }
}
