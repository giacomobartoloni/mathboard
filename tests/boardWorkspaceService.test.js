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
import { BoardPersistenceService, BOARD_PERSISTENCE_ERROR_CODES } from '../src/board/persistence/BoardPersistenceService.js'
import { BoardWorkspaceService } from '../src/board/BoardWorkspaceService.js'

function fixture({ onActiveBoardChanged } = {}) {
  const records = new Map()
  const repository = {
    fail: false,
    async get(id) { return records.get(id) },
    async put(record) {
      if (this.fail) throw new Error('storage unavailable')
      records.set(record.id, record)
      return record
    },
    async list() { return [...records.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) },
    async delete(boardId) { if (this.fail) throw new Error('storage unavailable'); records.delete(boardId) },
  }
  const objects = []
  const canvas = {
    getObjects: () => objects.slice(),
    remove: object => { const i = objects.indexOf(object); if (i >= 0) objects.splice(i, 1) },
    add: object => objects.push(object),
    discardActiveObject: () => {},
    requestRenderAll: () => {},
  }
  const session = new Map()
  const service = new BoardPersistenceService({
    repository,
    boardObjectPolicy: {},
    getCanvas: () => canvas,
    buildFormula: async () => null,
    resetHistory: () => {},
    suspendHistory: () => {},
    sessionStorage: {
      getItem: key => session.get(key) || null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    },
    now: () => '2026-10-23T12:00:00Z',
    onActiveBoardChanged,
  })
  const workspace = new BoardWorkspaceService(service)
  return { workspace, repository, service, records, session }
}

test('active board identity is reported after committed transitions', async () => {
  const changes = []
  const { workspace, service } = fixture({ onActiveBoardChanged: board => changes.push(board) })
  const algebra = await workspace.create({ title: 'Algebra' })
  const geometry = await workspace.create({ title: 'Geometry' })
  await workspace.open({ boardId: algebra.id })
  await workspace.rename({ boardId: algebra.id, title: 'Quadratics' })
  await workspace.delete({ boardId: algebra.id, confirm: true })

  assert.deepEqual(changes.slice(0, 4), [
    { id: algebra.id, title: 'Algebra' },
    { id: geometry.id, title: 'Geometry' },
    { id: algebra.id, title: 'Algebra' },
    { id: algebra.id, title: 'Quadratics' },
  ])
  assert.equal(changes.length, 5)
  assert.notEqual(changes[4].id, algebra.id)
  assert.equal(changes[4].id, geometry.id)
  assert.equal(changes[4].title, 'Geometry')
  service.dispose()
})

test('every newly persisted board is retained without a manual save step', async () => {
  const { workspace, records, service, session } = fixture()
  const first = await workspace.create({ title: 'Algebra' })
  assert.equal(first.isActive, true)
  assert.equal(records.get(first.id).kind, 'saved')
  assert.equal(session.get('mathboard.activeBoardId'), first.id)
  const renamed = await workspace.rename({ boardId: first.id, title: '  Quadratics  ' })
  assert.equal(renamed.title, 'Quadratics')
  assert.equal(records.get(first.id).document.title, 'Quadratics')
  const second = await workspace.create({ title: 'Geometry' })
  assert.equal(records.get(second.id).kind, 'saved')
  const opened = await workspace.open({ boardId: first.id })
  assert.equal(opened.id, first.id)
  assert.equal(service.title, 'Quadratics')
  assert.equal((await workspace.list()).length, 2)
  service.dispose()
})

test('invalid titles and storage errors preserve board metadata', async () => {
  const { workspace, repository, records, service } = fixture()
  const first = await workspace.create({ title: 'Valid' })
  const previous = records.get(first.id)
  await assert.rejects(() => workspace.rename({ boardId: first.id, title: '  ' }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.INVALID_TITLE)
  await assert.rejects(() => workspace.create({ title: 'x'.repeat(121) }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.INVALID_TITLE)
  repository.fail = true
  await assert.rejects(() => workspace.rename({ boardId: first.id, title: 'New name' }), /storage unavailable/)
  assert.equal(records.get(first.id), previous)
  repository.fail = false
  await assert.rejects(() => workspace.open({ boardId: 'does-not-exist' }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND)
  assert.equal(service.boardId, first.id)
  service.dispose()
})

test('archive hides a board and unarchive preserves its document and identity', async () => {
  const { workspace, service, records } = fixture()
  const original = await workspace.create({ title: 'Lesson A' })
  await workspace.create({ title: 'Lesson B' })
  const before = records.get(original.id).document
  const archived = await workspace.archive({ boardId: original.id })
  assert.equal(typeof archived.archivedAt, 'string')
  assert.equal(records.get(original.id).document, before)
  assert.ok(!(await workspace.list()).some(board => board.id === original.id))
  assert.ok((await workspace.listArchived()).some(board => board.id === original.id))
  await assert.rejects(() => workspace.open({ boardId: original.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED)
  await assert.rejects(() => workspace.rename({ boardId: original.id, title: 'Renamed' }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_ARCHIVED)
  await workspace.unarchive({ boardId: original.id })
  assert.ok((await workspace.list()).some(board => board.id === original.id))
  assert.equal(records.get(original.id).document, before)
  await assert.rejects(() => workspace.unarchive({ boardId: original.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_ARCHIVED)
  service.dispose()
})

test('archiving the only active board creates a retained empty replacement', async () => {
  const { workspace, service, records, session } = fixture()
  const current = await workspace.create({ title: 'In progress' })
  const archived = await workspace.archive({ boardId: current.id })
  assert.ok(archived.archivedAt)
  assert.notEqual(service.boardId, current.id)
  assert.equal(session.get('mathboard.activeBoardId'), service.boardId)
  assert.equal(records.get(service.boardId).kind, 'saved')
  assert.match(service.title, /^[a-z]+-[a-z]+$/)
  assert.equal(records.get(service.boardId).document.title, service.title)
  assert.equal((await workspace.listArchived()).length, 1)
  await workspace.unarchive({ boardId: current.id })
  await workspace.open({ boardId: current.id })
  assert.equal(service.title, 'In progress')
  service.dispose()
})

test('archiving the active board selects the latest modified remaining board', async () => {
  const { workspace, service, records, session } = fixture()
  const current = await workspace.create({ title: 'To archive' })
  const oldest = await workspace.create({ title: 'Older' })
  const newest = await workspace.create({ title: 'Latest' })
  const archivedCandidate = await workspace.create({ title: 'Already archived' })
  await workspace.archive({ boardId: archivedCandidate.id })

  // Use explicit timestamps to ensure the selection is based on edits, not IDs.
  records.set(oldest.id, { ...records.get(oldest.id), updatedAt: '2026-10-20T11:00:00Z' })
  records.set(newest.id, { ...records.get(newest.id), updatedAt: '2026-10-22T11:00:00Z' })
  records.set(current.id, { ...records.get(current.id), updatedAt: '2026-10-23T11:00:00Z' })
  await workspace.open({ boardId: current.id })
  const sizeBefore = records.size
  const archived = await workspace.archive({ boardId: current.id })

  assert.equal(archived.id, current.id)
  assert.equal(service.boardId, newest.id)
  assert.equal(service.title, 'Latest')
  assert.equal(session.get('mathboard.activeBoardId'), newest.id)
  assert.equal(records.size, sizeBefore)
  assert.ok((await workspace.list()).every(board => board.id !== current.id))
  service.dispose()
})

test('deleting active board opens most recently modified unarchived record without creating one', async () => {
  const { workspace, service, records } = fixture()
  const first = await workspace.create({ title: 'First' })
  const latest = await workspace.create({ title: 'Latest' })
  const target = await workspace.create({ title: 'Current' })
  records.set(first.id, { ...records.get(first.id), updatedAt: '2026-10-20T11:00:00Z' })
  records.set(latest.id, { ...records.get(latest.id), updatedAt: '2026-10-22T11:00:00Z' })
  await workspace.open({ boardId: target.id })
  const oldSize = records.size
  await workspace.delete({ boardId: target.id, confirm: true })
  assert.equal(service.boardId, latest.id)
  assert.equal(records.size, oldSize - 1)
  assert.equal(records.has(target.id), false)
  service.dispose()
})

test('inactive archive and delete preserve the active board and canvas', async () => {
  const { workspace, service, records } = fixture()
  const previous = await workspace.create({ title: 'Previous' })
  const current = await workspace.create({ title: 'Current' })
  await workspace.archive({ boardId: previous.id })
  assert.equal(service.boardId, current.id)
  await workspace.delete({ boardId: previous.id, confirm: true })
  assert.equal(service.boardId, current.id)
  assert.equal(records.size, 1)
  service.dispose()
})

test('an unloadable newest candidate prevents archiving or deleting the active board', async () => {
  const { workspace, service, records } = fixture()
  const active = await workspace.create({ title: 'Keep this board' })
  const candidate = await workspace.create({ title: 'Cannot open' })
  records.set(candidate.id, {
    ...records.get(candidate.id),
    updatedAt: '2099-01-01T00:00:00Z',
    document: { format: 'invalid', version: 1, title: 'Cannot open', objects: [] },
  })
  await workspace.open({ boardId: active.id })
  await assert.rejects(() => workspace.archive({ boardId: active.id }))
  assert.equal(service.boardId, active.id)
  assert.equal(records.get(active.id).archivedAt, undefined)
  await assert.rejects(() => workspace.delete({ boardId: active.id, confirm: true }))
  assert.equal(records.has(active.id), true)
  assert.equal(service.boardId, active.id)
  assert.equal(records.size, 2)
  service.dispose()
})

test('storage errors after choosing a fallback restore the previous active board', async () => {
  const { workspace, service, repository, records } = fixture()
  const target = await workspace.create({ title: 'Current' })
  const next = await workspace.create({ title: 'Next' })
  await workspace.open({ boardId: target.id })
  repository.fail = true
  await assert.rejects(() => workspace.archive({ boardId: target.id }), /storage unavailable/)
  assert.equal(service.boardId, target.id)
  assert.equal(records.get(target.id).archivedAt, undefined)
  await assert.rejects(() => workspace.delete({ boardId: target.id, confirm: true }), /storage unavailable/)
  assert.equal(service.boardId, target.id)
  assert.equal(records.has(target.id), true)
  assert.ok(records.has(next.id))
  service.dispose()
})

test('legacy scratch and trashed metadata remain recoverable without migration loss', async () => {
  const { workspace, service, records } = fixture()
  const scratch = await workspace.create({ title: 'Old draft' })
  records.set(scratch.id, { ...records.get(scratch.id), kind: 'scratch', trashedAt: '2026-10-20T12:00:00Z' })
  assert.equal((await workspace.listArchived())[0].id, scratch.id)
  await workspace.unarchive({ boardId: scratch.id })
  assert.equal(records.get(scratch.id).trashedAt, undefined)
  assert.equal(records.get(scratch.id).kind, 'scratch')
  assert.ok((await workspace.list()).some(board => board.id === scratch.id))
  service.dispose()
})

test('permanent delete requires confirmation and is not recoverable', async () => {
  const { workspace, records, service } = fixture()
  const first = await workspace.create({ title: 'To delete' })
  await workspace.create({ title: 'Remain' })
  await assert.rejects(() => workspace.delete({ boardId: first.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.CONFIRMATION_REQUIRED)
  assert.ok(records.has(first.id))
  const deleted = await workspace.delete({ boardId: first.id, confirm: true })
  assert.deepEqual(deleted, { id: first.id, deleted: true })
  assert.equal(records.has(first.id), false)
  await assert.rejects(() => workspace.open({ boardId: first.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND)
  assert.equal((await workspace.listArchived()).length, 0)
  service.dispose()
})

test('deleting active board preserves a new active record and storage errors leave the target', async () => {
  const { workspace, records, repository, service, session } = fixture()
  const current = await workspace.create({ title: 'Last board' })
  repository.fail = true
  await assert.rejects(() => workspace.delete({ boardId: current.id, confirm: true }), /storage unavailable/)
  assert.ok(records.has(current.id))
  assert.equal(service.boardId, current.id)
  repository.fail = false
  await workspace.delete({ boardId: current.id, confirm: true })
  assert.equal(records.has(current.id), false)
  assert.ok(records.has(service.boardId))
  assert.match(service.title, /^[a-z]+-[a-z]+$/)
  assert.equal(records.get(service.boardId).document.title, service.title)
  assert.equal(session.get('mathboard.activeBoardId'), service.boardId)
  service.dispose()
})

test('concurrent workspace actions commit in invocation order', async () => {
  const calls = []
  const deferred = {}
  deferred.promise = new Promise(resolve => { deferred.resolve = resolve })
  const workspace = new BoardWorkspaceService({
    boardId: 'a',
    async createNewBoard() { calls.push('create:start'); await deferred.promise; calls.push('create:done'); return { id: 'b', title: 'B' } },
    async listBoards() { calls.push('list'); return [] },
  })
  const creating = workspace.create()
  const listing = workspace.list()
  await Promise.resolve()
  assert.deepEqual(calls, ['create:start'])
  deferred.resolve()
  await Promise.all([creating, listing])
  assert.deepEqual(calls, ['create:start', 'create:done', 'list'])
})

test('omitted titles are generated and persisted while explicit names are preserved', async () => {
  const { workspace, records, service } = fixture()
  const generated = await workspace.create()
  assert.match(generated.title, /^[a-z]+-[a-z]+$/)
  assert.equal(records.get(generated.id).title, generated.title)
  assert.equal(records.get(generated.id).document.title, generated.title)
  const custom = await workspace.create({ title: '  My calculus board  ' })
  assert.equal(custom.title, 'My calculus board')
  assert.equal(records.get(custom.id).document.title, custom.title)
  await workspace.open({ boardId: generated.id })
  assert.equal(service.title, generated.title)
  service.dispose()
})
