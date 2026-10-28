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

import { BOARDS_STORE, idbRequest, idbTransactionDone, openMathBoardDb } from './indexedDb.js'

export const BOARD_RECORD_KINDS = Object.freeze({
  SCRATCH: 'scratch',
  SAVED: 'saved',
})

export function createBoardId() {
  return `mb_${globalThis.crypto.randomUUID()}`
}

export function createBoardRecord({
  id,
  kind = BOARD_RECORD_KINDS.SAVED,
  title,
  document,
  createdAt,
  updatedAt,
} = {}) {
  const now = new Date().toISOString()
  return {
    id: id || createBoardId(),
    kind,
    title: typeof title === 'string' ? title : 'Untitled board',
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
    document,
    revision: 1,
  }
}

export class BoardRevisionError extends Error {
  constructor(code) {
    super(code === 'board_not_found' ? 'Board no longer exists.' : 'Board changed in another writer.')
    this.name = 'BoardRevisionError'
    this.code = code
  }
}

export function boardRevision(record) {
  const revision = record?.revision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Invalid board revision.')
  }
  return revision
}

function nextRevision(current) {
  const revision = boardRevision(current)
  if (revision === Number.MAX_SAFE_INTEGER) throw new RangeError('Board revision limit reached.')
  return revision + 1
}

/**
 * Local board repository backed by IndexedDB.
 * Injectable `openDb` for tests.
 */
export class IndexedDbBoardRepository {
  constructor({ openDb = openMathBoardDb } = {}) {
    this._openDb = openDb
    this._dbPromise = null
  }

  _db() {
    if (!this._dbPromise) {
      this._dbPromise = this._openDb()
    }
    return this._dbPromise
  }

  async create(record) {
    if (boardRevision(record) !== 1) throw new RangeError('New boards must start at revision 1.')
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    await Promise.all([
      idbRequest(tx.objectStore(BOARDS_STORE).add(record)),
      idbTransactionDone(tx),
    ])
    return record
  }

  async get(boardId) {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readonly')
    const record = await idbRequest(tx.objectStore(BOARDS_STORE).get(boardId))
    return record ? { ...record, revision: boardRevision(record) } : null
  }

  async updateIfRevisionMatches(boardId, expectedRevision, buildNextRecordFromCurrent) {
    boardRevision({ revision: expectedRevision })
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    const store = tx.objectStore(BOARDS_STORE)
    const done = idbTransactionDone(tx)
    const operation = idbRequest(store.get(boardId)).then(current => {
      if (!current) throw new BoardRevisionError('board_not_found')
      if (boardRevision(current) !== expectedRevision) throw new BoardRevisionError('board_conflict')
      const next = buildNextRecordFromCurrent({ ...current, revision: expectedRevision })
      if (next === null) return { ...current, revision: expectedRevision }
      if (!next || typeof next !== 'object' || next.id !== boardId || next.then) {
        throw new TypeError('Revision update must return a synchronous record with the same board ID.')
      }
      const record = { ...next, revision: nextRevision(current) }
      store.put(record)
      return record
    }).catch(error => {
      tx.abort()
      throw error
    })
    const [record] = await Promise.all([operation, done])
    return record
  }

  async list() {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readonly')
    const rows = await idbRequest(tx.objectStore(BOARDS_STORE).getAll())
    return (rows || []).map(record => ({ ...record, revision: boardRevision(record) }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  async deleteIfRevisionMatches(boardId, expectedRevision) {
    boardRevision({ revision: expectedRevision })
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    const store = tx.objectStore(BOARDS_STORE)
    const done = idbTransactionDone(tx)
    const operation = idbRequest(store.get(boardId)).then(current => {
      if (!current) throw new BoardRevisionError('board_not_found')
      if (boardRevision(current) !== expectedRevision) throw new BoardRevisionError('board_conflict')
      store.delete(boardId)
    }).catch(error => {
      tx.abort()
      throw error
    })
    await Promise.all([operation, done])
  }
}
