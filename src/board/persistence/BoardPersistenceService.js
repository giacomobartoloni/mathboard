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
import { replaceBoardFromDocument, BoardReplacementRollbackError,
  BoardReplacementCommitError } from './replaceBoardFromDocument.js'
import { createEmptyBoardDocument } from './schema.js'
import { generateBoardName } from '../names/generateBoardName.js'
import {
  BOARD_RECORD_KINDS,
  createBoardId,
  createBoardRecord,
  boardRevision,
} from '../../storage/local/IndexedDbBoardRepository.js'

export const ACTIVE_BOARD_ID_KEY = 'mathboard.activeBoardId'
export const RECOVERY_BOARD_ID_KEY = 'mathboard.recoveryBoardId'
export const BOARD_PERSISTENCE_ERROR_CODES = Object.freeze({
  BOARD_NOT_FOUND: 'board_not_found',
  BOARD_RESTORE_FAILED: 'board_restore_failed',
  EDIT_IN_PROGRESS: 'edit_in_progress',
  INVALID_TITLE: 'invalid_board_title',
  BOARD_ARCHIVED: 'board_archived',
  BOARD_NOT_ARCHIVED: 'board_not_archived',
  CONFIRMATION_REQUIRED: 'confirmation_required',
  BOARD_CONFLICT: 'board_conflict',
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
    onActiveBoardChanged = () => {},
    onStatusChanged = () => {},
    lifecycle = null,
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
    this._onActiveBoardChanged = onActiveBoardChanged
    this._onStatusChanged = onStatusChanged
    this._lifecycle = lifecycle
    this._idleDebounceMs = idleDebounceMs
    this._maxWaitMs = maxWaitMs

    this.boardId = null
    this.revision = null
    this.title = 'Untitled board'
    this.changeVersion = 0
    this._idleTimer = null
    this._maxTimer = null
    this._savePromise = null
    this._conflicted = false
    this.status = {
      state: SAVE_STATES.CLEAN,
      lastSavedAt: null,
      error: null,
      errorCode: null,
      recoveryFailure: null,
    }
  }

  _setStatus(patch) {
    this.status = { ...this.status, ...patch }
    this._onStatusChanged(this.status)
  }

  _reportActiveBoard() {
    this._onActiveBoardChanged({ id: this.boardId, title: this.title })
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
    if (this._conflicted) {
      this._setStatus({ state: SAVE_STATES.ERROR })
      return
    }
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

  _withTransition(operation) {
    return this._lifecycle ? this._lifecycle.transition(operation) : operation(null)
  }

  _assertTransition(token) {
    if (this._lifecycle && !this._lifecycle.assertTransition(token)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
        'Board transition was interrupted.')
    }
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
    if (this._conflicted) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_CONFLICT,
        'Board changed in another tab. Save a copy before reloading.')
    }
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
    const savingBoardId = this.boardId
    const savingRevision = this.revision ?? 0
    this._setStatus({ state: SAVE_STATES.SAVING, error: null })

    this._savePromise = (async () => {
      try {
        const assertSavingBoard = () => {
          if (this.boardId !== savingBoardId) {
            throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
              'Active board changed while saving.')
          }
        }
        const document = this.serializeCurrent()
        const now = this._now()
        const kind = BOARD_RECORD_KINDS.SAVED
        assertSavingBoard()
        const record = await this._repository.updateIfRevisionMatches(savingBoardId, savingRevision, existing => {
          assertSavingBoard()
          if (existing.archivedAt || existing.trashedAt) {
            throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED,
              'This board was archived in another tab; unarchive it before editing.')
          }
          return { ...existing, kind, title: document.title, document, updatedAt: now }
        })
        assertSavingBoard()
        this.revision = boardRevision(record)

        if (this.changeVersion === savingVersion) {
          this._setStatus({
            state: SAVE_STATES.CLEAN,
            lastSavedAt: now,
            error: null,
            errorCode: null,
          })
        } else {
          this._setStatus({ state: SAVE_STATES.DIRTY })
          this._scheduleSave()
        }
        return record
      } catch (error) {
        if (this.boardId === savingBoardId) {
          if (error?.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_CONFLICT) this._conflicted = true
          this._setStatus({
            state: SAVE_STATES.ERROR,
            error: error?.message || String(error),
            errorCode: error?.code || null,
          })
        }
        throw error
      } finally {
        this._savePromise = null
      }
    })()

    return this._savePromise
  }

  /** Save the still-visible dirty canvas under a new ID after a CAS conflict. */
  recoverConflictAsCopy() {
    return this._withTransition(async token => {
      if (!this._conflicted || !this.boardId || !this._isDocumentStable()) {
        throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
          'A stable conflicted board is required for recovery.')
      }
      const document = this.serializeCurrent()
      document.title = `${this.title.slice(0, 103)} (Recovered copy)`
      const record = createBoardRecord({ title: document.title, document })
      await this._repository.create(record)
      if (token) this._assertTransition(token)
      this.boardId = record.id
      this.revision = record.revision
      this.title = record.title
      this.changeVersion = 0
      this._conflicted = false
      this._writeActiveBoardId(record.id)
      this._setStatus({ state: SAVE_STATES.CLEAN, error: null, errorCode: null,
        lastSavedAt: record.updatedAt })
      this._reportActiveBoard()
      return record
    })
  }

  async _flushBeforeTransition(token) {
    if (token) this._assertTransition(token)
    if (!this._isDocumentStable()) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
        'Finish the current board edit before switching boards.',
      )
    }
    if (!this.boardId) return
    await this.flush()
    if (token) this._assertTransition(token)
    if (this.status.state !== SAVE_STATES.CLEAN) {
      throw new Error('Current board must be saved before switching boards.')
    }
  }

  createNewBoard(title) {
    return this._withTransition(token => this._createNewBoard(title, token))
  }

  async _createNewBoard(title, token) {
    title = normalizeBoardTitle(title === undefined ? generateBoardName() : title)
    await this._flushBeforeTransition(token)
    const canvas = this._getCanvas()
    const document = createEmptyBoardDocument(title)
    const record = createBoardRecord({
      id: createBoardId(),
      kind: BOARD_RECORD_KINDS.SAVED,
      title: document.title,
      document,
    })

    await this._repository.create(record)
    try {
      if (token) this._assertTransition(token)
      await replaceBoardFromDocument({
        canvas,
        document,
        buildFormula: this._buildFormula,
        resetHistory: this._resetHistory,
        suspendHistory: this._suspendHistory,
        beforeInstall: () => { if (token) this._assertTransition(token) },
      })
    } catch (error) {
      if (error instanceof BoardReplacementRollbackError || error instanceof BoardReplacementCommitError) {
        this._lifecycle?.dispose()
      }
      try { await this._repository.deleteIfRevisionMatches(record.id, record.revision) } catch (cleanupError) {
        console.error('Could not remove an unactivated board record.', cleanupError)
      }
      throw error
    }

    this.boardId = record.id
    this.revision = record.revision
    this._conflicted = false
    this.title = record.title
    this.changeVersion = 0
    this._writeActiveBoardId(record.id)
    this._setStatus({ state: SAVE_STATES.CLEAN, lastSavedAt: record.updatedAt, error: null })
    this._reportActiveBoard()
    return record
  }

  // Historical scratch records are retained. Legacy trashedAt records
  // become archived and can be recovered using the Archive UI.
  _isArchived(record) {
    return Boolean(record?.archivedAt || record?.trashedAt)
  }

  _boardSummary(record) {
    return {
      id: record.id,
      title: record.title || 'Untitled board',
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      isActive: record.id === this.boardId,
      ...(this._isArchived(record) ? { archivedAt: record.archivedAt || record.trashedAt } : {}),
    }
  }

  async listBoards() {
    const records = await this._repository.list()
    return records.filter(record => !this._isArchived(record)).map(record => this._boardSummary(record))
  }

  async listArchivedBoards() {
    const records = await this._repository.list()
    return records.filter(record => this._isArchived(record)).map(record => this._boardSummary(record))
  }

  /**
   * Transition away from an active board before a destructive/archival action.
   * Ordinary library ordering comes from IndexedDbBoardRepository.list()
   * (updatedAt descending). Validate and open the preferred candidate first;
   * create a blank board only when no other unarchived board exists.
   */
  async _selectReplacementForActiveBoard(boardId, token) {
    if (boardId !== this.boardId) return null
    await this._flushBeforeTransition(token)
    const departedRevision = this.revision ?? 0
    const remaining = (await this.listBoards()).find(board => board.id !== boardId)
    if (remaining) {
      await this._openBoard(remaining.id, token)
      return { createdReplacementId: null, departedRevision }
    }
    const replacement = await this._createNewBoard(undefined, token)
    return { createdReplacementId: replacement.id, departedRevision }
  }

  async _restorePreviousBoardOnFailure(boardId, transition, token) {
    try {
      await this._openBoard(boardId, token)
    } catch (error) {
      // Keep the fallback if restoring the former active board fails.
      console.error('Could not restore the previous active board:', error)
      return
    }
    if (!transition?.createdReplacementId) return
    try {
      // Undo the extra blank record created before the failed mutation.
      await this._repository.deleteIfRevisionMatches(transition.createdReplacementId, 1)
    } catch (error) {
      // Best effort: preserve the original archive/delete failure.
      console.error('Could not remove the temporary replacement board:', error)
    }
  }

  archiveBoard(boardId) {
    return boardId === this.boardId
      ? this._withTransition(token => this._archiveBoard(boardId, token))
      : this._archiveBoard(boardId, null)
  }

  async _archiveBoard(boardId, token) {
    let record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
    }
    if (this._isArchived(record)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED, 'Board is already archived.')
    }
    const transition = await this._selectReplacementForActiveBoard(boardId, token)
    try {
      if (!record?.document) {
        throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
      }
      const archived = await this._repository.updateIfRevisionMatches(boardId,
        transition?.departedRevision ?? boardRevision(record), current => {
        if (this._isArchived(current)) throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED, 'Board is already archived.')
        const next = { ...current, archivedAt: this._now() }
        delete next.trashedAt
        return next
        })
      return archived
    } catch (error) {
      if (transition) await this._restorePreviousBoardOnFailure(boardId, transition, token)
      throw error
    }
  }

  async unarchiveBoard(boardId) {
    const record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
    }
    if (!this._isArchived(record)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_ARCHIVED, 'Board is not archived.')
    }
    const restored = await this._repository.updateIfRevisionMatches(boardId, boardRevision(record), current => {
      if (!this._isArchived(current)) throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_ARCHIVED, 'Board is not archived.')
      const next = { ...current }
      delete next.archivedAt
      delete next.trashedAt
      return next
    })
    return restored
  }

  deleteBoard(boardId, options = {}) {
    return boardId === this.boardId
      ? this._withTransition(token => this._deleteBoard(boardId, options, token))
      : this._deleteBoard(boardId, options, null)
  }

  async _deleteBoard(boardId, { confirm = false } = {}, token) {
    if (confirm !== true) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.CONFIRMATION_REQUIRED,
        'Permanent deletion requires explicit confirmation.')
    }
    const record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
    }
    const transition = await this._selectReplacementForActiveBoard(boardId, token)
    try {
      await this._repository.deleteIfRevisionMatches(boardId, transition?.departedRevision ?? boardRevision(record))
    } catch (error) {
      if (transition) await this._restorePreviousBoardOnFailure(boardId, transition, token)
      throw error
    }
    if (this._readRecoveryBoardId() === boardId) this._writeRecoveryBoardId(null)
    return { id: boardId, deleted: true }
  }

  async renameBoard(boardId, title) {
    title = normalizeBoardTitle(title)
    if (boardId === this.boardId) await this._flushBeforeTransition()
    const renamingVersion = this.changeVersion
    const record = await this._repository.get(boardId)
    if (!record?.document) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND, `Board not found: ${boardId}`)
    }
    if (this._isArchived(record)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED, 'Unarchive this board before renaming it.')
    }
    if (record.title === title && record.document.title === title) return record
    if (boardId === this.boardId && boardRevision(record) !== (this.revision ?? 0)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_CONFLICT, 'Board changed in another writer.')
    }
    const updatedAt = this._now()
    const renamed = await this._repository.updateIfRevisionMatches(boardId, boardRevision(record), current => {
      if (this._isArchived(current)) throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED, 'Unarchive this board before renaming it.')
      return { ...current, title, document: { ...current.document, title }, updatedAt }
    })
    if (boardId === this.boardId) {
      this.revision = renamed.revision
      this.title = title
      this._setStatus({ state: this.changeVersion === renamingVersion ? SAVE_STATES.CLEAN : SAVE_STATES.DIRTY,
        lastSavedAt: updatedAt, error: null })
      this._reportActiveBoard()
    }
    return renamed
  }

  openBoard(boardId) {
    return this._withTransition(token => this._openBoard(boardId, token))
  }

  async _openBoard(boardId, token) {
    await this._flushBeforeTransition(token)
    const record = await this._repository.get(boardId)
    if (token) this._assertTransition(token)
    if (!record?.document) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND,
        `Board not found: ${boardId}`,
      )
    }

    if (this._isArchived(record)) {
      throw new BoardPersistenceError(BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED, 'Unarchive this board before opening it.')
    }

    try {
      await replaceBoardFromDocument({
        canvas: this._getCanvas(),
        document: record.document,
        buildFormula: this._buildFormula,
        resetHistory: this._resetHistory,
        suspendHistory: this._suspendHistory,
        beforeInstall: () => { if (token) this._assertTransition(token) },
      })
    } catch (error) {
      if (error instanceof BoardReplacementRollbackError || error instanceof BoardReplacementCommitError) {
        this._lifecycle?.dispose()
      }
      throw error
    }

    this.boardId = record.id
    this.revision = boardRevision(record)
    this._conflicted = false
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
    this._reportActiveBoard()
    return record
  }

  /**
   * Attach persistence to the current canvas contents as a new local board
   * (e.g. after Stamp URL bootstrap). Does not clear the canvas.
   */
  adoptCurrentCanvasAsNewBoard() {
    return this._withTransition(token => this._adoptCurrentCanvasAsNewBoard(token))
  }

  async _adoptCurrentCanvasAsNewBoard(token) {
    if (!this._isDocumentStable()) {
      throw new BoardPersistenceError(
        BOARD_PERSISTENCE_ERROR_CODES.EDIT_IN_PROGRESS,
        'Finish the current board edit before creating a new board.',
      )
    }
    const document = this.serializeCurrent()
    document.title = generateBoardName()
    const record = createBoardRecord({
      id: createBoardId(),
      kind: BOARD_RECORD_KINDS.SAVED,
      title: document.title,
      document,
    })
    await this._repository.create(record)
    if (token) this._assertTransition(token)
    this.boardId = record.id
    this.revision = record.revision
    this._conflicted = false
    this.title = record.title
    this.changeVersion = 0
    this._writeActiveBoardId(record.id)
    this._setStatus({
      state: SAVE_STATES.CLEAN,
      lastSavedAt: record.updatedAt,
      error: null,
    })
    this._reportActiveBoard()
    return record
  }

  /**
   * Bootstrap: restore this tab's active board or create a new local board.
   * Historical scratch records are retained; no automatic garbage collection.
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

    return result
  }

}
