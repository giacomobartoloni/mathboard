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
import { getDesktopBoardMethods } from '../board/agent/desktop-commands.js'
import { validateBoardId } from '../board/BoardDocumentCommandService.js'

const SCHEMA_VERSION = 2
const MAX_REPLY_BYTES = 7 * 1024 * 1024
const MAX_COMMAND_LIFETIME_MS = 10000
const allowed = new Set(getDesktopBoardMethods())
const safeCodes = new Set([
  'board_not_ready', 'invalid_object_spec', 'invalid_object_patch', 'object_not_found',
  'nested_object_mutation_not_supported', 'formula_render_failed', 'board_commit_failed',
  'invalid_capture_request', 'capture_too_large', 'capture_failed',
  'invalid_board_id', 'board_conflict', 'board_not_found', 'board_archived',
  'board_context_changed', 'board_context_required', 'command_timeout',
  'execution_unknown', 'board_busy',
])

function safeError(error) {
  return { code: safeCodes.has(error?.code) ? error.code : 'board_bridge_error',
    message: 'Board command could not be completed.' }
}

function validEnvelope(request, appGeneration, rendererGeneration) {
  try { validateBoardId(request?.boardId) } catch { return false }
  return request && typeof request === 'object'
    && typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 128
    && request.appGeneration === appGeneration
    && request.rendererGeneration === rendererGeneration
    && request.schemaVersion === SCHEMA_VERSION
    && Number.isSafeInteger(request.boardEpoch)
    && request.boardEpoch >= 0
    && Number.isSafeInteger(request.expiresAtMs)
    && request.expiresAtMs <= Date.now() + MAX_COMMAND_LIFETIME_MS + 1000
    && (request.cancellationEpoch === undefined
      || (Number.isSafeInteger(request.cancellationEpoch) && request.cancellationEpoch >= 0))
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
  capture.attach()
  let disposed = false
  let appGeneration = null
  let stateQueue = Promise.resolve()
  let commandQueue = Promise.resolve()
  const seenRequestIds = new Set()
  // Epochs are native transport cancellation tokens, not board-domain permissions.
  const activeCancellableRequests = new Map()
  let minimumCancellationEpoch = 0

  const publishState = (ready, epoch) => {
    const activeBoardId = board.getBoardId?.() || null
    const task = stateQueue.then(async () => {
      if (disposed) return
      const generation = await invokeCommand('board_bridge_state', {
        rendererGeneration, boardEpoch: epoch, activeBoardId, ready,
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
  const handleRequest = async (request, signal) => {
    if (disposed || signal?.aborted || !validEnvelope(request, appGeneration, rendererGeneration)) return
    const reply = { requestId: request.requestId, appGeneration,
      rendererGeneration, boardEpoch: request.boardEpoch, boardId: request.boardId,
      schemaVersion: SCHEMA_VERSION }
    if (!allowed.has(request.method)) {
      reply.ok = false
      reply.error = { code: 'invalid_command', message: 'Unsupported board command.' }
    } else if (signal?.aborted || Date.now() >= request.expiresAtMs) {
      reply.ok = false
      reply.error = { code: 'command_timeout', message: 'Board command expired before execution.' }
    } else if (getBoard() !== board || !lifecycle.isReady() || request.boardEpoch !== lifecycle.epoch) {
      reply.ok = false
      reply.error = { code: 'board_not_ready', message: 'Board changed before execution.' }
    } else {
      const mutates = boardCommandMutatesBoard(request.method)
      const finish = mutates && request.boardId === board.getBoardId()
        ? capture.beginMutation() : () => {}
      try {
        reply.result = await board.getBoardDocumentCommands().executeOnBoard(request, {
          expiresAtMs: request.expiresAtMs,
          signal,
          capture: signal ? { screenshot: (params) => capture.screenshot(params, signal) } : capture,
          isCurrent: () => !disposed && !signal?.aborted && getBoard() === board && request.boardEpoch === lifecycle.epoch,
        })
        reply.ok = true
        if (mutates && Date.now() >= request.expiresAtMs) {
          reply.ok = false
          delete reply.result
          reply.error = { code: 'execution_unknown', message: 'Board outcome requires readback.' }
        }
      } catch (error) {
        reply.ok = false
        reply.error = safeError(error)
      } finally {
        finish()
      }
    }
    if (disposed || signal?.aborted) return
    let replyJson = JSON.stringify(reply)
    if (new TextEncoder().encode(replyJson).length > MAX_REPLY_BYTES) {
      const possibleWrite = boardCommandMutatesBoard(request.method) && reply.ok
      replyJson = JSON.stringify({ requestId: request.requestId, appGeneration,
        rendererGeneration, boardEpoch: request.boardEpoch, boardId: request.boardId,
        schemaVersion: SCHEMA_VERSION,
        ok: false, error: possibleWrite
          ? { code: 'execution_unknown', message: 'Board outcome requires readback.' }
          : { code: 'capture_too_large', message: 'Board result exceeds the limit.' } })
    }
    try { await invokeCommand('board_bridge_reply', { replyJson }) } catch {
      // Native timeout/revocation may have removed this request already.
    }
  }
  const onRequest = ({ payload }) => {
    if (!validEnvelope(payload, appGeneration, rendererGeneration)) return commandQueue
    if (payload.cancellationEpoch !== undefined
      && payload.cancellationEpoch < minimumCancellationEpoch) return commandQueue
    if (seenRequestIds.has(payload.requestId)) return commandQueue
    seenRequestIds.add(payload.requestId)
    if (seenRequestIds.size > 256) seenRequestIds.delete(seenRequestIds.values().next().value)
    const aborter = payload.cancellationEpoch === undefined ? null : new AbortController()
    if (aborter) activeCancellableRequests.set(payload.requestId,
      { aborter, epoch: payload.cancellationEpoch })
    commandQueue = commandQueue.then(() => handleRequest(payload, aborter?.signal)).catch(() => {})
      .finally(() => activeCancellableRequests.delete(payload.requestId))
    return commandQueue
  }

  let unlisten, unlistenCancellation
  try {
    unlisten = await subscribe('mathboard-board-request', onRequest)
    unlistenCancellation = await subscribe('mathboard-board-cancel', ({ payload }) => {
      if (!Number.isSafeInteger(payload) || payload < 0 || payload < minimumCancellationEpoch) return
      minimumCancellationEpoch = payload
      for (const { aborter, epoch } of activeCancellableRequests.values()) {
        if (epoch < payload) aborter.abort()
      }
    })
    await publishState(lifecycle.isReady(), lifecycle.epoch)
  } catch (error) {
    disposed = true
    unsubscribeLifecycle()
    unlisten?.()
    unlistenCancellation?.()
    capture.dispose()
    throw error
  }

  return () => {
    if (disposed) return
    disposed = true
    unsubscribeLifecycle()
    unlisten()
    unlistenCancellation()
    for (const { aborter } of activeCancellableRequests.values()) aborter.abort()
    capture.dispose()
    void invokeCommand('board_bridge_state', {
      rendererGeneration, boardEpoch: lifecycle.epoch, activeBoardId: board.getBoardId?.() || null,
      ready: false,
    }).catch(() => {})
  }
}
