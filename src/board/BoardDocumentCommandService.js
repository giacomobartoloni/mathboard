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

import { Canvas } from 'fabric'
import { BoardController } from './BoardController.js'
import { executeDesktopBoardCommand, getDesktopBoardMethods } from './agent/desktop-commands.js'
import { boardCommandMutatesBoard } from './agent/command-registry.js'
import { materializeBoardDocument } from './persistence/materializeBoardDocument.js'
import { serializeBoardDocument } from './persistence/serializeBoardDocument.js'
import { disposeMaterializedObject } from './objects/materialize.js'

const allowed = new Set(getDesktopBoardMethods())
const inactive = new Set(['observe', 'measure', 'create', 'createMany', 'update',
  'delete', 'deleteMany', 'clear', 'group'])
const MAX_BOARD_ID_LENGTH = 131
const MAX_REQUEST_LIFETIME_MS = 10000
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_FORMULA_RENDERS = 2

export class BoardTargetError extends Error {
  constructor(code) {
    super(code)
    this.name = 'BoardTargetError'
    this.code = code
  }
}

export function validateBoardId(boardId) {
  if (typeof boardId !== 'string' || boardId.length > MAX_BOARD_ID_LENGTH
    || !/^mb_[A-Za-z0-9_-]+$/.test(boardId)) {
    throw new BoardTargetError('invalid_board_id')
  }
  return boardId
}

function defaultCanvas() {
  const canvas = new Canvas(document.createElement('canvas'), { width: 1, height: 1,
    renderOnAddRemove: false })
  canvas.cancelRequestedRender()
  canvas.requestRenderAll = () => {}
  return canvas
}

function collectObject(owned, object) {
  if (!object || owned.has(object)) return
  owned.add(object)
  object.getObjects?.().forEach(child => collectObject(owned, child))
}

/** Internal, request-scoped BoardDocument executor. No native or MCP ingress. */
export class BoardDocumentCommandService {
  constructor({ repository, boardObjectPolicy, lifecycle, getActiveBoardId,
    getActiveController, getActiveRevision = () => null,
    buildFormula, createCanvas = defaultCanvas,
    prepareCreatedObject = () => {}, prepareUpdatedObject = () => {},
    now = () => new Date().toISOString() }) {
    this._repository = repository
    this._policy = boardObjectPolicy
    this._lifecycle = lifecycle
    this._getActiveBoardId = getActiveBoardId
    this._getActiveController = getActiveController
    this._getActiveRevision = getActiveRevision
    this._buildFormula = buildFormula
    this._createCanvas = createCanvas
    this._prepareCreatedObject = prepareCreatedObject
    this._prepareUpdatedObject = prepareUpdatedObject
    this._now = now
    this._activeRenders = 0
  }

  async _renderFormula(spec, guard, context, expiresAtMs) {
    guard()
    if (this._activeRenders >= MAX_FORMULA_RENDERS) throw new BoardTargetError('board_busy')
    this._activeRenders += 1
    const render = Promise.resolve().then(() => this._buildFormula(spec))
    render.then(() => { this._activeRenders -= 1 }, () => { this._activeRenders -= 1 })
    let timer
    let onAbort
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new BoardTargetError('command_timeout')),
        Math.max(0, expiresAtMs - Date.now()))
      onAbort = () => reject(new BoardTargetError('command_timeout'))
      context.signal?.addEventListener?.('abort', onAbort, { once: true })
    })
    try {
      const formula = await Promise.race([render, expiry])
      guard()
      return formula
    } catch (error) {
      render.then(formula => disposeMaterializedObject(formula), () => {})
      throw error
    } finally {
      clearTimeout(timer)
      context.signal?.removeEventListener?.('abort', onAbort)
    }
  }

  async executeOnBoard(command, trustedContext = {}) {
    const context = Object.freeze({ ...trustedContext })
    let request
    try { request = structuredClone(command) } catch { throw new BoardTargetError('invalid_command') }
    if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_REQUEST_BYTES) {
      throw new BoardTargetError('invalid_command')
    }
    const boardId = validateBoardId(request?.boardId)
    const method = request?.method
    if (!allowed.has(method)) throw new BoardTargetError('invalid_command')
    const expiresAtMs = context.expiresAtMs
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= 0
      || expiresAtMs > Date.now() + MAX_REQUEST_LIFETIME_MS + 1000) {
      throw new BoardTargetError('invalid_command')
    }
    const originBoardId = this._getActiveBoardId()
    const lease = this._lifecycle.capture()
    const activeTarget = boardId === originBoardId
    const guard = () => {
      if (Date.now() >= expiresAtMs || context.signal?.aborted) {
        throw new BoardTargetError('command_timeout')
      }
      if (!this._lifecycle.assertCurrent(lease) || this._getActiveBoardId() !== originBoardId
        || context.isCurrent?.() === false
        || (!activeTarget && this._getActiveBoardId() === boardId)) {
        throw new BoardTargetError('board_context_changed')
      }
    }
    guard()
    const record = await this._repository.get(boardId)
    guard()
    if (!record?.document) throw new BoardTargetError('board_not_found')
    if (record.archivedAt || record.trashedAt) throw new BoardTargetError('board_archived')
    if (activeTarget) {
      const loadedRevision = this._getActiveRevision()
      if (loadedRevision !== null && record.revision !== loadedRevision) {
        throw new BoardTargetError('board_conflict')
      }
      const result = await executeDesktopBoardCommand(this._getActiveController(guard,
        spec => this._renderFormula(spec, guard, context, expiresAtMs)), request,
        context.capture)
      try { guard() } catch (error) {
        if (boardCommandMutatesBoard(method)) throw new BoardTargetError('execution_unknown')
        throw error
      }
      return method === 'observe' ? { ...result, revision: record.revision } : result
    }
    if (!inactive.has(method)) throw new BoardTargetError('board_context_required')

    const canvas = this._createCanvas()
    const owned = new Set()
    const history = []
    try {
      const materialized = await materializeBoardDocument(record.document, {
        buildFormula: spec => this._renderFormula(spec, guard, context, expiresAtMs),
        beforeNode: guard,
      })
      materialized.objects.forEach(object => collectObject(owned, object))
      guard()
      canvas.insertAt(0, ...materialized.objects)
      const controller = new BoardController({
        getCanvas: () => canvas,
        boardObjectPolicy: this._policy,
        buildFormula: spec => this._renderFormula(spec, guard, context, expiresAtMs),
        pushHistoryCommand: commandEntry => { history.push(commandEntry); return true },
        prepareCreatedObject: this._prepareCreatedObject,
        prepareUpdatedObject: this._prepareUpdatedObject,
        isMutationStable: () => true,
        getBoardId: () => boardId,
        commitGuard: guard,
      })
      let result = await executeDesktopBoardCommand(controller, request)
      for (const entry of history) {
        collectObject(owned, entry.object)
        collectObject(owned, entry.group)
        collectObject(owned, entry.added)
        collectObject(owned, entry.removed)
        entry.entries?.forEach(item => collectObject(owned, item.object))
        entry.members?.forEach(item => collectObject(owned, item.object))
      }
      canvas.getObjects().forEach(object => collectObject(owned, object))
      guard()
      if (method === 'observe') {
        result = { ...result, boardId, revision: record.revision, viewport: null,
          selection: { ids: [] } }
      }
      if (!history.length) return result
      const document = serializeBoardDocument({ canvas, boardObjectPolicy: this._policy,
        title: materialized.document.title })
      guard()
      const updatedAt = this._now()
      await this._repository.updateIfRevisionMatches(boardId, record.revision, current => {
        guard()
        if (current.archivedAt || current.trashedAt) throw new BoardTargetError('board_archived')
        return { ...current, document, kind: 'saved', updatedAt }
      })
      try { guard() } catch { throw new BoardTargetError('execution_unknown') }
      return result
    } finally {
      try { canvas.getObjects().forEach(object => collectObject(owned, object)) } catch { /* best effort */ }
      try { canvas.cancelRequestedRender?.() } catch { /* best effort */ }
      try { await canvas.dispose?.() } catch (error) {
        console.error('Detached board canvas cleanup failed.', error)
      }
      owned.forEach(object => {
        try { object.dispose?.() } catch { /* Continue releasing other objects. */ }
      })
    }
  }
}
