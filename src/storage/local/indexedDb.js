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

export const MATHBOARD_DB_NAME = 'mathboard'
export const MATHBOARD_DB_VERSION = 1
export const BOARDS_STORE = 'boards'

/**
 * Open (and upgrade) the MathBoard IndexedDB database.
 * @param {IDBFactory} [indexedDB]
 * @returns {Promise<IDBDatabase>}
 */
export function openMathBoardDb(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MATHBOARD_DB_NAME, MATHBOARD_DB_VERSION)
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BOARDS_STORE)) {
        const store = db.createObjectStore(BOARDS_STORE, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
        store.createIndex('title', 'title', { unique: false })
      }
    }
  })
}

export function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'))
  })
}

export function idbTransactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'))
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'))
  })
}
