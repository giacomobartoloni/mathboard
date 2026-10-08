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

import { BOARDS_STORE, idbRequest, openMathBoardDb } from './indexedDb.js'

export function createBoardId() {
  return `mb_${globalThis.crypto.randomUUID()}`
}

export function createBoardRecord({ id, title, document, createdAt, updatedAt } = {}) {
  const now = new Date().toISOString()
  return {
    id: id || createBoardId(),
    title: typeof title === 'string' ? title : 'Untitled board',
    createdAt: createdAt || now,
    updatedAt: updatedAt || now,
    document,
  }
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
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(BOARDS_STORE).add(record))
    return record
  }

  async get(boardId) {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readonly')
    return idbRequest(tx.objectStore(BOARDS_STORE).get(boardId))
  }

  async put(record) {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(BOARDS_STORE).put(record))
    return record
  }

  async list() {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readonly')
    const rows = await idbRequest(tx.objectStore(BOARDS_STORE).getAll())
    return (rows || []).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  async delete(boardId) {
    const db = await this._db()
    const tx = db.transaction(BOARDS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(BOARDS_STORE).delete(boardId))
  }
}
