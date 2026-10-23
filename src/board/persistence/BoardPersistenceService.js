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

import { serializeBoardDocument } from './serializeBoardDocument.js'
import { replaceBoardFromDocument } from './replaceBoardFromDocument.js'
import { createEmptyBoardDocument } from './schema.js'
import {
  BOARD_RECORD_KINDS,
  createBoardId,
  createBoardRecord,
} from '../../storage/local/IndexedDbBoardRepository.js'

export const ACTIVE_BOARD_ID_KEY = 'mathboard.activeBoardId'
export const RECOVERY_BOARD_ID_KEY = 'mathboard.recoveryBoardId'
export const BOARD_PERSISTENCE_ERROR_CODES = Object.freeze({
  BOARD_NOT_FOUND: 'board_not_found',
  BOARD_RESTORE_FAILED: 'board_restore_failed',
  EDIT_IN_PROGRESS: 'edit_in_progress',
  INVALID_TITLE: 'invalid_board_title',
})

export class BoardPersistenceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BoardPersistenceError'
    this.code = code
  }
}

export const SAVE_STATES = Object.freeze({
  CLEAN: 'clean',
  DIRTY: 'dirty',
  SAVING: 'saving',
  ERROR: 'error',
})

export const SCRATCH_BOARD_RETENTION_DAYS = 30
const SCRATCH_BOARD_RETENTION_MS = SCRATCH_BOARD_RETENTION_DAYS * 24 * 60 * 60 * 1000

const IDLE_DEBOUNCE_MS = 1000
const MAX_WAIT_MS = 5000

export function normalizeBoardTitle(title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120
    || [...title].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) {
    throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.INVALID_TITLE, 'Board title must contain 1–120 printable characters.')
  }
  return title.trim()
}

/**
 * Orchestrates BoardDocument serialize/save/load against a board repository.
 * Does not own Fabric rendering details.
 */
export class BoardPersistenceService {
  constructor({
    repository,
    boardObjectPolicy,
    getCanvas,
    buildFormula,
    resetHistory,
    suspendHistory,
    getTitle = () => 'Untitled board',
    isDocumentStable = () => true,
    sessionStorage = globalThis.sessionStorage,
    now = () => new Date().toISOString(),
    idleDebounceMs = IDLE_DEBOUNCE_MS,
    maxWaitMs = MAX_WAIT_MS,
  }) {
    this._repository = repository
    this._boardObjectPolicy = boardObjectPolicy
    this._getCanvas = getCanvas
    this._buildFormula = buildFormula
    this._resetHistory = resetHistory
    this._suspendHistory = suspendHistory
    this._getTitle = getTitle
    this._isDocumentStable = isDocumentStable
    this._sessionStorage = sessionStorage
    this._now = now
    this._idleDebounceMs = idleDebounceMs
    this._maxWaitMs = maxWaitMs

    this.boardId = null
    this.title = 'Untitled board'
    this.changeVersion = 0
    this._idleTimer = null
    this._maxTimer = null
    this._savePromise = null
    this.status = {
      state: SAVE_STATES.CLEAN,
      lastSavedAt: null,
      error: null,
      recoveryFailure: null,
    }
  }

  _setStatus(patch) {
    this.status = { ...this.status, ...patch }
  }

  _readActiveBoardId() {
    try {
      return this._sessionStorage?.getItem?.(ACTIVE_BOARD_ID_KEY) || null
    } catch {
      return null
    }
  }

  _writeActiveBoardId(boardId) {
    try {
      if (boardId) this._sessionStorage?.setItem?.(ACTIVE_BOARD_ID_KEY, boardId)
      else this._sessionStorage?.removeItem?.(ACTIVE_BOARD_ID_KEY)
    } catch {
      // Keep runtime usable if storage is unavailable.
    }
  }

  _writeRecoveryBoardId(boardId) {
    try {
      if (boardId) this._sessionStorage?.setItem?.(RECOVERY_BOARD_ID_KEY, boardId)
      else this._sessionStorage?.removeItem?.(RECOVERY_BOARD_ID_KEY)
    } catch {
      // ignore quota / private mode
    }
  }

  _readRecoveryBoardId() {
    try {
      return this._sessionStorage?.getItem?.(RECOVERY_BOARD_ID_KEY) || null
    } catch {
      return null
    }
  }

  _runScheduledFlush() {
    void this.flush().catch((error) => {
      console.error('Automatic board save failed', error)
    })
  }

  notifyDocumentChanged() {
    this.changeVersion += 1
    this._setStatus({ state: SAVE_STATES.DIRTY, error: null })
    this._scheduleSave()
  }

  _scheduleSave() {
    if (this._idleTimer) clearTimeout(this._idleTimer)
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null
      this._runScheduledFlush()
    }, this._idleDebounceMs)

    if (!this._maxTimer) {
      this._maxTimer = setTimeout(() => {
        this._maxTimer = null
        this._runScheduledFlush()
      }, this._maxWaitMs)
    }
  }

  _clearTimers() {
    if (this._idleTimer) clearTimeout(this._idleTimer)
    if (this._maxTimer) clearTimeout(this._maxTimer)
    this._idleTimer = null
    this._maxTimer = null
  }

  dispose() {
    this._clearTimers()
  }

  serializeCurrent() {
    const canvas = this._getCanvas()
    return serializeBoardDocument({
      canvas,
      boardObjectPolicy: this._boardObjectPolicy,
      title: this.title || this._getTitle(),
    })
  }

  async flush() {
    if (this._savePromise) return this._savePromise
    if (this.status.state === SAVE_STATES.CLEAN) {
      return null
    }
    if (!this.boardId) return null
    if (!this._isDocumentStable()) {
      this._setStatus({ state: SAVE_STATES.DIRTY, error: null })
      this._scheduleSave()
      return null
    }

    this._clearTimers()
    const savingVersion = this.changeVersion
    this._setStatus({ state: SAVE_STATES.SAVING, error: null })

    this._savePromise = (async () => {
      try {
        const document = this.serializeCurrent()
        const existing = await this._repository.get(this.boardId)
        const now = this._now()
        const kind = existing?.kind ?? BOARD_RECORD_KINDS.SCRATCH
        const record = createBoardRecord({
          id: this.boardId,
          kind,
          title: document.title,
          document,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        })
        await this._repository.put(record)

        if (this.changeVersion === savingVersion) {
          this._setStatus({
            state: SAVE_STATES.CLEAN,
            lastSavedAt: now,
            error: null,
          })
        } else {
          this._setStatus({ state: SAVE_STATES.DIRTY })
          this._scheduleSave()
        }
        return record
      } catch (error) {
        this._setStatus({
          state: SAVE_STATES.ERROR,
          error: error?.message || String(error),
        })
        throw error
      } finally {
        this._savePromise = null
      }
    })()

    return this._savePromise
  }

  async _flushBeforeTransition() {
    if (!this._isDocumentStable()) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
        'Finish the current board edit before switching boards.',
      )
    }
    if (!this.boardId) return
    await this.flush()
    if (this.status.state !== SAVE_STATES.CLEAN) {
      throw new Error('Current board must be saved before switching boards.')
    }
  }

  async createNewBoard(title = this._getTitle()) {
    title = normalizeBoardTitle(title)
    await this._flushBeforeTransition()
    const canvas = this._getCanvas()
    const document = createEmptyBoardDocument(title)
    const record = createBoardRecord({
      id: createBoardId(),
      kind: BOARD_RECORD_KINDS.SCRATCH,
      title: document.title,
      document,
    })

    await this._repository.put(record)

    if (typeof canvas?.discardActiveObject === 'function') {
      canvas.discardActiveObject()
    }
    this._suspendHistory?.(true)
    try {
      canvas.getObjects().slice().forEach((object) => canvas.remove(object))
    } finally {
      this._suspendHistory?.(false)
    }
    this._resetHistory?.()
    canvas?.requestRenderAll?.()

    this.boardId = record.id
    this.title = record.title
    this.changeVersion = 0
    this._writeActiveBoardId(record.id)
    this._setStatus({ state: SAVE_STATES.CLEAN, lastSavedAt: record.updatedAt, error: null })
    return record
  }

  async listBoards() {
    const records = await this._repository.list()
    return records.map(({ id, title, kind, createdAt, updatedAt }) => ({
      id, title: title || 'Untitled board', kind: kind || BOARD_RECORD_KINDS.SCRATCH,
      createdAt: createdAt || null, updatedAt: updatedAt || null,
      isActive: id === this.boardId,
    }))
  }

  async saveCurrentBoard() {
    await this._flushBeforeTransition()
    const record = await this._repository.get(this.boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, 'Active board is unavailable.')
    }
    if (record.kind === BOARD_RECORD_KINDS.SAVED) return record
    const updatedAt = this._now()
    const saved = { ...record, kind: BOARD_RECORD_KINDS.SAVED, updatedAt }
    await this._repository.put(saved)
    this._setStatus({ state: SAVE_STATES.CLEAN, lastSavedAt: updatedAt, error: null })
    return saved
  }

  async renameBoard(boardId, title) {
    title = normalizeBoardTitle(title)
    if (boardId === this.boardId) await this._flushBeforeTransition()
    const record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
    }
    if (record.title === title && record.document.title === title) return record
    const updatedAt = this._now()
    const renamed = { ...record, title, document: { ...record.document, title }, updatedAt }
    await this._repository.put(renamed)
    if (boardId === this.boardId) {
      this.title = title
      this._setStatus({ state: SAVE_STATES.CLEAN, lastSavedAt: updatedAt, error: null })
    }
    return renamed
  }

  async openBoard(boardId) {
    await this._flushBeforeTransition()
    const record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND,
        `Board not found: ${boardId}`,
      )
    }

    await replaceBoardFromDocument({
      canvas: this._getCanvas(),
      document: record.document,
      buildFormula: this._buildFormula,
      resetHistory: this._resetHistory,
      suspendHistory: this._suspendHistory,
    })

    this.boardId = record.id
    this.title = record.title || record.document.title || 'Untitled board'
    this.changeVersion = 0
    this._writeActiveBoardId(record.id)
    if (this._readRecoveryBoardId() === record.id) {
      this._writeRecoveryBoardId(null)
      this._setStatus({ recoveryFailure: null })
    }
    this._setStatus({
      state: SAVE_STATES.CLEAN,
      lastSavedAt: record.updatedAt || null,
      error: null,
    })
    return record
  }

  /**
   * Attach persistence to the current canvas contents as a new local board
   * (e.g. after Stamp URL bootstrap). Does not clear the canvas.
   */
  async adoptCurrentCanvasAsNewBoard() {
    if (!this._isDocumentStable()) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
        'Finish the current board edit before creating a new board.',
      )
    }
    const document = this.serializeCurrent()
    const record = createBoardRecord({
      id: createBoardId(),
      kind: BOARD_RECORD_KINDS.SCRATCH,
      title: document.title,
      document,
    })
    await this._repository.put(record)
    this.boardId = record.id
    this.title = record.title
    this.changeVersion = 0
    this._writeActiveBoardId(record.id)
    this._setStatus({
      state: SAVE_STATES.CLEAN,
      lastSavedAt: record.updatedAt,
      error: null,
    })
    return record
  }

  /**
   * Bootstrap: restore this tab's active board or create a new local board,
   * then run a best-effort pass that drops expired scratch records.
   */
  async bootstrap() {
    const activeId = this._readActiveBoardId()
    let result

    if (activeId) {
      try {
        result = await this.openBoard(activeId)
      } catch (error) {
        console.error('Failed to restore active board; creating a new one.', error)
        this._setStatus({
          state: SAVE_STATES.ERROR,
          error: error?.message || String(error),
        })
        const missing = error?.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND
        if (!missing) this._writeRecoveryBoardId(activeId)
        const record = await this.createNewBoard()
        const restoreFailure = {
          boardId: activeId,
          code: missing
            ? BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND
            : BOARD_PERSISTENCE_ERROR_CODES.BOARD_RESTORE_FAILED,
          recoverable: !missing,
          error,
        }
        this._setStatus({ recoveryFailure: restoreFailure })
        result = { record, restoreFailure }
      }
    } else {
      result = await this.createNewBoard()
    }

    await this._pruneOldScratchBoards()
    return result
  }

  /**
   * Delete scratch records older than the retention window.
   * Best effort: never fails bootstrap and never touches anything that is not
   * explicitly marked scratch, the active board, or the recovery board.
   */
  async _pruneOldScratchBoards() {
    try {
      const records = await this._repository.list()
      const recoveryBoardId = this._readRecoveryBoardId()
      const nowMs = Date.parse(this._now())
      if (!Number.isFinite(nowMs)) return

      const cutoff = nowMs - SCRATCH_BOARD_RETENTION_MS

      for (const record of records) {
        if (record?.kind !== BOARD_RECORD_KINDS.SCRATCH) continue
        if (record.id === this.boardId) continue
        if (record.id === recoveryBoardId) continue

        const timestamp = Date.parse(record.updatedAt || record.createdAt)
        if (!Number.isFinite(timestamp)) continue
        if (timestamp >= cutoff) continue

        await this._repository.delete(record.id)
      }
    } catch (error) {
      console.warn('Old scratch board cleanup failed.', error)
    }
  }
}
