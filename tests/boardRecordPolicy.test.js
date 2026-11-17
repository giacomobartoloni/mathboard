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

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isArchivedBoardRecord,
  isTrashedBoardRecord,
  isExpiredTrashedBoardRecord,
  summarizeBoardRecord,
} from '../src/board/persistence/boardRecordPolicy.js'

const NOW_MS = Date.parse('2026-10-23T12:00:00Z')

test('board lifecycle predicates keep historical trashedAt in Archive', () => {
  const current = { id: 'recent' }
  const archived = { id: 'archived', archivedAt: '2026-10-01T00:00:00Z' }
  const legacy = { id: 'legacy', trashedAt: '2020-01-01T00:00:00Z' }
  const trash = { id: 'trash', deletedAt: '2026-10-20T00:00:00Z' }

  assert.equal(isArchivedBoardRecord(current), false)
  assert.equal(isArchivedBoardRecord(archived), true)
  assert.equal(isArchivedBoardRecord(legacy), true)
  assert.equal(isTrashedBoardRecord(legacy), false)
  assert.equal(isTrashedBoardRecord(trash), true)
  assert.equal(isExpiredTrashedBoardRecord(legacy, NOW_MS), false)
})

test('Trash expiry is strict at 30 elapsed days and safe for invalid times', () => {
  const record = deletedAt => ({ deletedAt })
  assert.equal(isExpiredTrashedBoardRecord(record('2026-09-23T11:59:59Z'), NOW_MS), true)
  assert.equal(isExpiredTrashedBoardRecord(record('2026-09-23T12:00:00Z'), NOW_MS), false)
  assert.equal(isExpiredTrashedBoardRecord(record('2026-09-23T12:00:01Z'), NOW_MS), false)
  assert.equal(isExpiredTrashedBoardRecord(record('2099-01-01T00:00:00Z'), NOW_MS), false)
  assert.equal(isExpiredTrashedBoardRecord(record('not-a-date'), NOW_MS), false)
  assert.equal(isExpiredTrashedBoardRecord(record(undefined), NOW_MS), false)
  assert.equal(isExpiredTrashedBoardRecord(record('2026-09-01T00:00:00Z'), NaN), false)
  assert.equal(isExpiredTrashedBoardRecord(record('2026-09-01T00:00:00Z'), Infinity), false)
})

test('record summaries preserve Archive and Trash metadata, not document bodies', () => {
  const document = { title: 'Geometry', objects: [{ id: 'object-id' }] }
  const active = {
    id: 'b1',
    title: 'Geometry',
    archivedAt: '2026-10-20T00:00:00Z',
    deletedAt: '2026-10-21T00:00:00Z',
    createdAt: '2026-09-12T00:00:00Z',
    updatedAt: '2026-10-19T00:00:00Z',
    document,
  }
  const summary = summarizeBoardRecord(active, active.id)
  assert.deepEqual(summary, {
    id: active.id,
    title: active.title,
    createdAt: active.createdAt,
    updatedAt: active.updatedAt,
    isActive: true,
    archivedAt: active.archivedAt,
    deletedAt: active.deletedAt,
  })
  assert.equal('document' in summary, false)

  assert.deepEqual(summarizeBoardRecord({
    id: 'legacy',
    trashedAt: '2020-01-01T00:00:00Z',
  }, 'active'), {
    id: 'legacy',
    title: 'Untitled board',
    createdAt: null,
    updatedAt: null,
    isActive: false,
    archivedAt: '2020-01-01T00:00:00Z',
  })
})
