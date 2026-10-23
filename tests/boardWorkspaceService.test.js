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

function fixture() {
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
  })
  const workspace = new BoardWorkspaceService(service)
  return { workspace, repository, service, records, session }
}

test('library and workspace share local identity, saved metadata and document title', async () => {
  const { workspace, records, service, session } = fixture()
  const first = await workspace.create({ title: 'Algebra' })
  assert.equal(first.kind, 'scratch')
  assert.equal(first.isActive, true)
  assert.equal(session.get('mathboard.activeBoardId'), first.id)
  assert.equal((await workspace.list()).length, 1)
  const renamed = await workspace.rename({ boardId: first.id, title: '  Quadratics  ' })
  assert.equal(renamed.title, 'Quadratics')
  assert.equal(records.get(first.id).document.title, 'Quadratics')
  const saved = await workspace.save()
  assert.equal(saved.kind, 'saved')
  const second = await workspace.create({ title: 'Geometry' })
  assert.notEqual(second.id, first.id)
  assert.equal(second.kind, 'scratch')
  const opened = await workspace.open({ boardId: first.id })
  assert.equal(opened.id, first.id)
  assert.equal(opened.isActive, true)
  assert.equal(service.title, 'Quadratics')
  assert.equal((await workspace.list()).filter(item => item.isActive).length, 1)
  service.dispose()
})

test('invalid titles and storage errors do not alter the active library record', async () => {
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
  assert.equal(service.title, 'Valid')
  repository.fail = false
  await assert.rejects(() => workspace.open({ boardId: 'does-not-exist' }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND)
  assert.equal(service.boardId, first.id)
  service.dispose()
})

test('boards can be deleted to trash, hidden, and restored without changing document identity', async () => {
  const { workspace, service, records } = fixture()
  const original = await workspace.create({ title: 'Lesson A' })
  const second = await workspace.create({ title: 'Lesson B' })
  assert.equal(second.isActive, true)
  const before = records.get(original.id).document
  const trashed = await workspace.trash({ boardId: original.id })
  assert.equal(trashed.id, original.id)
  assert.equal(typeof trashed.trashedAt, 'string')
  assert.equal(records.get(original.id).document, before)
  assert.ok(!(await workspace.list()).some(board => board.id === original.id))
  assert.ok((await workspace.listTrash()).some(board => board.id === original.id))
  await assert.rejects(() => workspace.open({ boardId: original.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_TRASHED)
  await assert.rejects(() => workspace.rename({ boardId: original.id, title: 'Renamed' }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_TRASHED)
  const restored = await workspace.restore({ boardId: original.id })
  assert.equal(restored.id, original.id)
  assert.equal(restored.kind, 'scratch')
  assert.equal(records.get(original.id).document, before)
  assert.ok((await workspace.list()).some(board => board.id === original.id))
  assert.ok(!(await workspace.listTrash()).some(board => board.id === original.id))
  await assert.rejects(() => workspace.restore({ boardId: original.id }),
    error => error.code === BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_TRASHED)
  service.dispose()
})

test('trashing the active board creates a replacement and keeps its document recoverable', async () => {
  const { workspace, service, records, session } = fixture()
  const current = await workspace.create({ title: 'Lesson to delete' })
  const trashed = await workspace.trash({ boardId: current.id })
  assert.equal(trashed.trashedAt !== undefined, true)
  assert.notEqual(service.boardId, current.id)
  assert.equal(session.get('mathboard.activeBoardId'), service.boardId)
  assert.equal((await workspace.list()).length, 1)
  assert.equal((await workspace.listTrash()).length, 1)
  await workspace.restore({ boardId: current.id })
  const opened = await workspace.open({ boardId: current.id })
  assert.equal(opened.id, current.id)
  assert.equal(records.get(current.id).trashedAt, undefined)
  service.dispose()
})

test('trash write failures leave ordinary boards visible and recoverable', async () => {
  const { workspace, repository, service, records } = fixture()
  const first = await workspace.create({ title: 'Keep' })
  await workspace.create({ title: 'Current' })
  repository.fail = true
  await assert.rejects(() => workspace.trash({ boardId: first.id }), /storage unavailable/)
  assert.equal(records.get(first.id).trashedAt, undefined)
  repository.fail = false
  assert.ok((await workspace.list()).some(board => board.id === first.id))
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
