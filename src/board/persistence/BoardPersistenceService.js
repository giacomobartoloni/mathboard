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
  createBoardId,
  createBoardRecord,
} from '../../storage/local/IndexedDbBoardRepository.js'

export const LAST_BOARD_ID_KEY = 'mathboard.lastBoardId'
export const RECOVERY_BOARD_ID_KEY = 'mathboard.recoveryBoardId'
export const BOARD_PERSISTENCE_ERROR_CODES = Object.freeze({
  BOARD_NOT_FOUND: 'board_not_found',
  BOARD_RESTORE_FAILED: 'board_restore_failed',
  EDIT_IN_PROGRESS: 'edit_in_progress',
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
  SAVED: 'saved',
  ERROR: 'error',
})

const IDLE_DEBOUNCE_MS = 1000
const MAX_WAIT_MS = 5000

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
    storage = globalThis.localStorage,
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
    this._storage = storage
    this._now = now
    this._idleDebounceMs = idleDebounceMs
    this._maxWaitMs = maxWaitMs

    this.boardId = null
    this.title = 'Untitled board'
    this.changeVersion = 0
    this._savingVersion = null
    this._idleTimer = null
    this._maxTimer = null
    this._savePromise = null
    this.status = {
      state: SAVE_STATES.CLEAN,
      lastSavedAt: null,
      error: null,
      recoveryFailure: null,
    }
    this._listeners = new Set()
  }

  onStatusChange(listener) {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  _emit() {
    this._listeners.forEach((listener) => {
      try {
        listener(this.status)
      } catch (error) {
        console.error('BoardPersistenceService listener failed', error)
      }
    })
  }

  _setStatus(patch) {
    this.status = { ...this.status, ...patch }
    this._emit()
  }

  _readLastBoardId() {
    try {
      return this._storage?.getItem?.(LAST_BOARD_ID_KEY) || null
    } catch {
      return null
    }
  }

  _writeLastBoardId(boardId) {
    try {
      if (boardId) this._storage?.setItem?.(LAST_BOARD_ID_KEY, boardId)
      else this._storage?.removeItem?.(LAST_BOARD_ID_KEY)
    } catch {
      // ignore quota / private mode
    }
  }

  _writeRecoveryBoardId(boardId) {
    try {
      if (boardId) this._storage?.setItem?.(RECOVERY_BOARD_ID_KEY, boardId)
      else this._storage?.removeItem?.(RECOVERY_BOARD_ID_KEY)
    } catch {
      // ignore quota / private mode
    }
  }

  _readRecoveryBoardId() {
    try {
      return this._storage?.getItem?.(RECOVERY_BOARD_ID_KEY) || null
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
    this._listeners.clear()
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
    if (this.status.state === SAVE_STATES.CLEAN || this.status.state === SAVE_STATES.SAVED) {
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
    this._savingVersion = savingVersion
    this._setStatus({ state: SAVE_STATES.SAVING, error: null })

    this._savePromise = (async () => {
      try {
        const document = this.serializeCurrent()
        const existing = await this._repository.get(this.boardId)
        const now = this._now()
        const record = createBoardRecord({
          id: this.boardId,
          title: document.title,
          document,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        })
        await this._repository.put(record)
        this._writeLastBoardId(this.boardId)

        if (this.changeVersion === savingVersion) {
          this._setStatus({
            state: SAVE_STATES.SAVED,
            lastSavedAt: now,
            error: null,
          })
          // Settle to clean after a brief saved flash for UI.
          this._setStatus({ state: SAVE_STATES.CLEAN })
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
        this._savingVersion = null
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
    if (this.status.state !== SAVE_STATES.CLEAN && this.status.state !== SAVE_STATES.SAVED) {
      throw new Error('Current board must be saved before switching boards.')
    }
  }

  async createNewBoard() {
    await this._flushBeforeTransition()
    const canvas = this._getCanvas()
    const document = createEmptyBoardDocument(this._getTitle())
    const record = createBoardRecord({
      id: createBoardId(),
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
    this._writeLastBoardId(record.id)
    this._setStatus({ state: SAVE_STATES.CLEAN, lastSavedAt: record.updatedAt, error: null })
    return record
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
    this._writeLastBoardId(record.id)
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
      title: document.title,
      document,
    })
    await this._repository.put(record)
    this.boardId = record.id
    this.title = record.title
    this.changeVersion = 0
    this._writeLastBoardId(record.id)
    this._setStatus({
      state: SAVE_STATES.CLEAN,
      lastSavedAt: record.updatedAt,
      error: null,
    })
    return record
  }

  /**
   * Bootstrap: restore last board or create a new empty local board.
   */
  async bootstrap() {
    const lastId = this._readLastBoardId()
    if (lastId) {
      try {
        return await this.openBoard(lastId)
      } catch (error) {
        console.error('Failed to restore last board; creating a new one.', error)
        this._setStatus({
          state: SAVE_STATES.ERROR,
          error: error?.message || String(error),
        })
        const missing = error?.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND
        if (!missing) this._writeRecoveryBoardId(lastId)
        const record = await this.createNewBoard()
        const restoreFailure = {
          boardId: lastId,
          code: missing
            ? BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND
            : BOARD_PERSISTENCE_ERROR_CODES.BOARD_RESTORE_FAILED,
          recoverable: !missing,
          error,
        }
        this._setStatus({ recoveryFailure: restoreFailure })
        return { record, restoreFailure }
      }
    }
    return this.createNewBoard()
  }
}
