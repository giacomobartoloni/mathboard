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
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { openMathBoardDb } from '../src/storage/local/indexedDb.js'
import {
  BOARD_RECORD_KINDS,
  createBoardRecord,
  IndexedDbBoardRepository,
} from '../src/storage/local/IndexedDbBoardRepository.js'

test('createBoardRecord defaults to a retained saved record', () => {
  const record = createBoardRecord({ id: 'mb_default' })
  assert.equal(record.kind, BOARD_RECORD_KINDS.SAVED)
  assert.equal(createBoardRecord({ kind: BOARD_RECORD_KINDS.SCRATCH }).kind, BOARD_RECORD_KINDS.SCRATCH)
})

test('failed conditional transaction leaves the previous record untouched', async () => {
  const repository = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  await repository.create(createBoardRecord({ id: boardId, title: 'Before', document: { objects: [] } }))
  await assert.rejects(() => repository.updateIfRevisionMatches(boardId, 1, () => {
    throw new Error('materialization failed')
  }), /materialization failed/)
  assert.equal((await repository.get(boardId)).title, 'Before')
  assert.equal((await repository.get(boardId)).revision, 1)
})

test('two repository instances cannot commit the same board revision twice', async () => {
  const openDb = () => openMathBoardDb(fakeIndexedDB)
  const first = new IndexedDbBoardRepository({ openDb })
  const second = new IndexedDbBoardRepository({ openDb })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  const initial = createBoardRecord({ id: boardId, document: { objects: [] } })
  await first.create(initial)
  assert.equal((await second.get(boardId)).revision, 1)

  const outcomes = await Promise.allSettled([
    first.updateIfRevisionMatches(boardId, 1, current => ({ ...current, title: 'First' })),
    second.updateIfRevisionMatches(boardId, 1, current => ({ ...current, title: 'Second' })),
  ])
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter(result => result.reason?.code === 'board_conflict').length, 1)
  assert.equal((await first.get(boardId)).revision, 2)
})

test('legacy revision zero is upgraded once and stale delete cannot remove its successor', async () => {
  const repository = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  const db = await openMathBoardDb(fakeIndexedDB)
  const transaction = db.transaction('boards', 'readwrite')
  transaction.objectStore('boards').add({ id: boardId, title: 'Legacy', document: { objects: [] } })
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onabort = reject
  })
  assert.equal((await repository.get(boardId)).revision, 0)
  const updated = await repository.updateIfRevisionMatches(boardId, 0, current => ({ ...current, title: 'Current' }))
  assert.equal(updated.revision, 1)
  await assert.rejects(() => repository.deleteIfRevisionMatches(boardId, 0), { code: 'board_conflict' })
  assert.equal((await repository.get(boardId)).title, 'Current')
})

test('no-op update keeps revision and overflow fails without changing storage', async () => {
  const repository = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  await repository.create(createBoardRecord({ id: boardId, title: 'Before', document: { objects: [] } }))
  const unchanged = await repository.updateIfRevisionMatches(boardId, 1, () => null)
  assert.equal(unchanged.revision, 1)
  const db = await openMathBoardDb(fakeIndexedDB)
  const transaction = db.transaction('boards', 'readwrite')
  transaction.objectStore('boards').put({ ...unchanged, revision: Number.MAX_SAFE_INTEGER })
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onabort = reject
  })
  await assert.rejects(() => repository.updateIfRevisionMatches(boardId, Number.MAX_SAFE_INTEGER,
    current => ({ ...current, title: 'After' })), /revision limit/)
  assert.equal((await repository.get(boardId)).title, 'Before')
  await assert.rejects(() => repository.updateIfRevisionMatches(boardId, -1, current => current), /Invalid board revision/)
})
