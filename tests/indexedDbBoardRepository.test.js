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
import { IndexedDbBoardRepository } from '../src/storage/local/IndexedDbBoardRepository.js'

test('write consumes request and transaction failures together', async () => {
  const request = { error: new Error('request failed'), onsuccess: null, onerror: null }
  const tx = {
    error: new Error('transaction aborted'), oncomplete: null, onabort: null, onerror: null,
    objectStore: () => ({
      put: () => {
        queueMicrotask(() => request.onerror?.())
        queueMicrotask(() => tx.onabort?.())
        return request
      },
    }),
  }
  const repository = new IndexedDbBoardRepository({
    openDb: async () => ({ transaction: () => tx }),
  })

  await assert.rejects(() => repository.put({ id: 'mb_test' }), /request failed|transaction aborted/)
  await new Promise((resolve) => setImmediate(resolve))
})
