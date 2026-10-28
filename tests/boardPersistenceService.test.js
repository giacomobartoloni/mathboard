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
import { Rect } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { ensureMathBoardObjectId } from '../src/board/ids.js'
import { BoardLifecycle } from '../src/board/BoardLifecycle.js'
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb'
import { openMathBoardDb } from '../src/storage/local/indexedDb.js'
import { IndexedDbBoardRepository, createBoardRecord } from '../src/storage/local/IndexedDbBoardRepository.js'
import {
  BoardPersistenceService,
  BOARD_PERSISTENCE_ERROR_CODES,
  RECOVERY_BOARD_ID_KEY,
  SAVE_STATES,
} from '../src/board/persistence/BoardPersistenceService.js'

installFabricDomStub()

function makeCanvas(objects = []) {
  const list = objects.slice()
  return {
    getObjects: () => list.slice(),
    add: (object) => { list.push(object) },
    remove: (object) => {
      const index = list.indexOf(object)
      if (index >= 0) list.splice(index, 1)
    },
    discardActiveObject: () => {},
    requestRenderAll: () => {},
  }
}

function makeRepository(records = new Map()) {
  return {
    puts: [],
    deletes: [],
    async get(id) {
      return records.get(id) || null
    },
    async create(record) {
      this.puts.push(record)
      records.set(record.id, record)
      return record
    },
    async updateIfRevisionMatches(id, expectedRevision, build) {
      const current = records.get(id)
      if (!current) throw Object.assign(new Error('Board missing'), { code: 'board_not_found' })
      if ((current.revision ?? 0) !== expectedRevision) throw Object.assign(new Error('Board conflict'), { code: 'board_conflict' })
      const next = build(current)
      if (next === null) return current
      const record = { ...next, revision: expectedRevision + 1 }
      this.puts.push(record)
      records.set(id, record)
      return record
    },
    async list() {
      return [...records.values()]
    },
    async deleteIfRevisionMatches(id, expectedRevision) {
      const current = records.get(id)
      if (!current) throw Object.assign(new Error('Board missing'), { code: 'board_not_found' })
      if ((current.revision ?? 0) !== expectedRevision) throw Object.assign(new Error('Board conflict'), { code: 'board_conflict' })
      this.deletes.push(id)
      records.delete(id)
    },
  }
}

function makeService({ canvas = makeCanvas(), repository = makeRepository(), isDocumentStable, lifecycle,
  resetHistory = () => {}, suspendHistory = () => {} } = {}) {
  return new BoardPersistenceService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => canvas,
    buildFormula: async () => null,
    resetHistory,
    suspendHistory,
    getTitle: () => 'Board',
    sessionStorage: new MapStorage(),
    now: () => '2026-10-08T00:00:00.000Z',
    idleDebounceMs: 60000,
    maxWaitMs: 60000,
    isDocumentStable,
    lifecycle,
  })
}

class MapStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.get(key) || null
  }

  setItem(key, value) {
    this.values.set(key, value)
  }

  removeItem(key) {
    this.values.delete(key)
  }
}

test('active autosave preserves dirty canvas after another repository changes its revision', async () => {
  const openDb = () => openMathBoardDb(fakeIndexedDB)
  const repository = new IndexedDbBoardRepository({ openDb })
  const otherTab = new IndexedDbBoardRepository({ openDb })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  await repository.create(createBoardRecord({ id: boardId, title: 'Board',
    document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }))
  const canvas = makeCanvas()
  const service = makeService({ canvas, repository })
  await service.openBoard(boardId)
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_unsaved')
  canvas.add(rect)
  service.notifyDocumentChanged()
  await otherTab.updateIfRevisionMatches(boardId, 1, current => ({ ...current, title: 'Other tab' }))

  await assert.rejects(() => service.flush(), { code: 'board_conflict' })
  assert.equal(service.status.state, SAVE_STATES.ERROR)
  assert.deepEqual(canvas.getObjects(), [rect])
  assert.equal((await repository.get(boardId)).title, 'Other tab')
  const recovered = await service.recoverConflictAsCopy()
  assert.notEqual(recovered.id, boardId)
  assert.equal(service.boardId, recovered.id)
  assert.equal(service.status.state, SAVE_STATES.CLEAN)
  assert.deepEqual(recovered.document.objects.map(object => object.id), ['mbobj_unsaved'])
  assert.equal((await repository.get(boardId)).title, 'Other tab')
  service.dispose()
})

test('deleted active record offers a recoverable copy of unsaved canvas edits', async () => {
  const openDb = () => openMathBoardDb(fakeIndexedDB)
  const repository = new IndexedDbBoardRepository({ openDb })
  const otherTab = new IndexedDbBoardRepository({ openDb })
  const boardId = `mb_${globalThis.crypto.randomUUID()}`
  await repository.create(createBoardRecord({ id: boardId, title: 'Board',
    document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }))
  const canvas = makeCanvas()
  const service = makeService({ canvas, repository })
  await service.openBoard(boardId)
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_unsaved')
  canvas.add(rect)
  service.notifyDocumentChanged()
  await otherTab.deleteIfRevisionMatches(boardId, 1)
  await assert.rejects(() => service.flush(), { code: 'board_not_found' })
  assert.equal(service.status.errorCode, 'board_not_found')
  const recovered = await service.recoverConflictAsCopy()
  assert.notEqual(recovered.id, boardId)
  assert.deepEqual(recovered.document.objects.map(object => object.id), ['mbobj_unsaved'])
  assert.equal(service.status.state, SAVE_STATES.CLEAN)
  service.dispose()
})

test('active rename does not clear a document edit made during its storage commit', async () => {
  const records = new Map([['mb_rename', { id: 'mb_rename', title: 'Before', revision: 1,
    document: { format: 'mathboard-board', version: 1, title: 'Before', objects: [] } }]])
  const repository = makeRepository(records)
  const service = makeService({ repository })
  await service.openBoard('mb_rename')
  const update = repository.updateIfRevisionMatches.bind(repository)
  let release
  repository.updateIfRevisionMatches = (...args) => new Promise(resolve => {
    release = () => resolve(update(...args))
  })
  const pending = service.renameBoard('mb_rename', 'After')
  await new Promise(resolve => setImmediate(resolve))
  service.notifyDocumentChanged()
  release()
  await pending
  assert.equal(service.status.state, SAVE_STATES.DIRTY)
  service.dispose()
})

test('flush defers an unstable document until it becomes committed', async () => {
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_rect')
  const repository = makeRepository(new Map([['mb_current', { id: 'mb_current', kind: 'saved', title: 'Board', document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }]]))
  let stable = false
  const service = makeService({
    canvas: makeCanvas([rect]),
    repository,
    isDocumentStable: () => stable,
  })
  service.boardId = 'mb_current'

  service.notifyDocumentChanged()
  await service.flush()

  assert.equal(repository.puts.length, 0)
  assert.equal(service.status.state, SAVE_STATES.DIRTY)

  stable = true
  await service.flush()
  assert.equal(repository.puts.length, 1)
  assert.equal(service.status.state, SAVE_STATES.CLEAN)
  service.dispose()
})

test('a delayed flush cannot save or update status for a different active board', async () => {
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_rect')
  const repository = makeRepository(new Map([['mb_a', { id: 'mb_a', kind: 'saved', title: 'Board',
    document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }]]))
  let finishRead
  const update = repository.updateIfRevisionMatches.bind(repository)
  repository.updateIfRevisionMatches = (...args) => new Promise(resolve => {
    finishRead = () => resolve(update(...args))
  })
  const service = makeService({ canvas: makeCanvas([rect]), repository })
  service.boardId = 'mb_a'
  service.notifyDocumentChanged()
  const pending = service.flush()
  await new Promise(resolve => setImmediate(resolve))
  service.boardId = 'mb_b'
  service.status = { ...service.status, state: SAVE_STATES.CLEAN }
  finishRead()

  await assert.rejects(pending, /Active board changed while saving/)
  assert.equal(repository.puts.length, 0)
  assert.equal(service.status.state, SAVE_STATES.CLEAN)
  service.dispose()
})

test('failed flush blocks opening another board and preserves the current canvas', async () => {
  const current = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(current, 'mbobj_current')
  const canvas = makeCanvas([current])
  const repository = makeRepository(new Map([['mb_current', { id: 'mb_current', kind: 'saved', title: 'Board', document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }], ['mb_target', {
    id: 'mb_target',
    title: 'Target',
    document: { format: 'mathboard-board', version: 1, title: 'Target', objects: [] },
  }]]))
  repository.updateIfRevisionMatches = async () => {
    throw new Error('disk full')
  }
  const service = makeService({ canvas, repository })
  service.boardId = 'mb_current'
  service.notifyDocumentChanged()

  await assert.rejects(() => service.openBoard('mb_target'), /disk full/)
  assert.deepEqual(canvas.getObjects(), [current])
  assert.equal(service.boardId, 'mb_current')
  service.dispose()
})

test('opening a board blocks new work before reading storage and invalidates the previous lease', async () => {
  const lifecycle = new BoardLifecycle()
  const old = lifecycle.capture()
  const document = { format: 'mathboard-board', version: 1, title: 'Target', objects: [] }
  let finishRead
  const repository = makeRepository()
  repository.get = async id => id === 'mb_target'
    ? new Promise(resolve => { finishRead = () => resolve({ id, title: 'Target', document }) })
    : null
  const service = makeService({ repository, lifecycle })
  service.boardId = 'mb_current'
  const pending = service.openBoard('mb_target')

  assert.equal(lifecycle.isReady(), false)
  assert.equal(lifecycle.assertCurrent(old), false)
  await new Promise(resolve => setImmediate(resolve))
  finishRead()
  await pending
  assert.equal(service.boardId, 'mb_target')
  assert.equal(lifecycle.isReady(), true)
  assert.equal(lifecycle.assertCurrent(old), false)
  service.dispose()
})

test('an unrecoverable canvas replacement leaves the board lifecycle closed', async () => {
  const lifecycle = new BoardLifecycle()
  const keep = new Rect({ width: 10, height: 10 })
  const canvas = makeCanvas([keep])
  canvas.add = () => { throw new Error('canvas cannot restore') }
  const document = { format: 'mathboard-board', version: 1, title: 'Target',
    objects: [{ id: 'mbobj_new', type: 'rect', width: 12, height: 8 }] }
  const repository = makeRepository(new Map([['mb_target', { id: 'mb_target', title: 'Target', document }]]))
  const service = makeService({ canvas, repository, lifecycle })

  await assert.rejects(() => service.openBoard('mb_target'), /replacement and rollback failed/)
  assert.equal(lifecycle.isReady(), false)
  service.dispose()
})

test('failed new-board canvas installation preserves the active board and objects', async () => {
  const lifecycle = new BoardLifecycle()
  const first = new Rect({ width: 10, height: 10 })
  const second = new Rect({ width: 20, height: 20 })
  const canvas = makeCanvas([first, second])
  const remove = canvas.remove
  let calls = 0
  canvas.remove = object => {
    calls += 1
    if (calls === 2) throw new Error('canvas removal failed')
    remove(object)
  }
  const repository = makeRepository(new Map([['mb_current', {
    id: 'mb_current', kind: 'saved', title: 'Current',
    document: { format: 'mathboard-board', version: 1, title: 'Current', objects: [] },
  }]]))
  const service = makeService({ canvas, repository, lifecycle })
  service.boardId = 'mb_current'

  await assert.rejects(() => service.createNewBoard('Next'), /canvas removal failed/)
  assert.equal(service.boardId, 'mb_current')
  assert.deepEqual(canvas.getObjects(), [first, second])
  assert.equal((await repository.list()).length, 1)
  assert.equal(lifecycle.isReady(), true)
  service.dispose()
})

test('a failed repaint after replacement keeps the new board identity and a usable lifecycle', async () => {
  const lifecycle = new BoardLifecycle()
  const canvas = makeCanvas([new Rect({ width: 10, height: 10 })])
  canvas.requestRenderAll = () => { throw new Error('paint failed') }
  const document = { format: 'mathboard-board', version: 1, title: 'B', objects: [] }
  const repository = makeRepository(new Map([['mb_b', { id: 'mb_b', title: 'B', document }]]))
  const service = makeService({ canvas, repository, lifecycle })
  service.boardId = 'mb_a'

  await service.openBoard('mb_b')
  assert.equal(service.boardId, 'mb_b')
  assert.deepEqual(canvas.getObjects(), [])
  assert.equal(lifecycle.isReady(), true)
  service.dispose()
})

test('failed history reset after canvas replacement fails closed', async () => {
  const lifecycle = new BoardLifecycle()
  const canvas = makeCanvas([new Rect({ width: 10, height: 10 })])
  const document = { format: 'mathboard-board', version: 1, title: 'B', objects: [] }
  const repository = makeRepository(new Map([['mb_b', { id: 'mb_b', title: 'B', document }]]))
  const service = makeService({ canvas, repository, lifecycle,
    resetHistory: () => { throw new Error('history reset failed') } })
  service.boardId = 'mb_a'

  await assert.rejects(() => service.openBoard('mb_b'), /history reset failed/)
  assert.equal(lifecycle.isReady(), false)
  service.dispose()
})

test('failed history resume after canvas replacement fails closed', async () => {
  const lifecycle = new BoardLifecycle()
  const canvas = makeCanvas([new Rect({ width: 10, height: 10 })])
  const document = { format: 'mathboard-board', version: 1, title: 'B', objects: [] }
  const repository = makeRepository(new Map([['mb_b', { id: 'mb_b', title: 'B', document }]]))
  const service = makeService({ canvas, repository, lifecycle,
    suspendHistory: flag => { if (!flag) throw new Error('history resume failed') } })
  service.boardId = 'mb_a'

  await assert.rejects(() => service.openBoard('mb_b'), /history resume failed/)
  assert.equal(lifecycle.isReady(), false)
  service.dispose()
})

test('new board write failure preserves the current runtime', async () => {
  const current = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(current, 'mbobj_current')
  const canvas = makeCanvas([current])
  const repository = makeRepository()
  repository.create = async () => {
    throw new Error('disk full')
  }
  const service = makeService({ canvas, repository })
  service.boardId = 'mb_current'

  await assert.rejects(() => service.createNewBoard(), /disk full/)
  assert.deepEqual(canvas.getObjects(), [current])
  assert.equal(service.boardId, 'mb_current')
  service.dispose()
})

test('bootstrap preserves failed restore metadata while opening a fallback board', async () => {
  const sessionStorage = new MapStorage()
  sessionStorage.setItem('mathboard.activeBoardId', 'mb_missing')
  const repository = makeRepository()
  const service = new BoardPersistenceService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(),
    buildFormula: async () => null,
    resetHistory: () => {},
    suspendHistory: () => {},
    sessionStorage,
    now: () => '2026-10-08T00:00:00.000Z',
  })

  const result = await service.bootstrap()

  assert.equal(result.restoreFailure.boardId, 'mb_missing')
  assert.equal(result.restoreFailure.code, BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND)
  assert.equal(sessionStorage.getItem('mathboard.recoveryBoardId'), null)
  assert.match(result.record.id, /^mb_/)
  service.dispose()
})

test('clean but unstable board cannot be replaced', async () => {
  const current = new Rect({ width: 10, height: 10 })
  const canvas = makeCanvas([current])
  const repository = makeRepository()
  const service = makeService({ canvas, repository, isDocumentStable: () => false })
  service.boardId = 'mb_current'

  await assert.rejects(() => service.createNewBoard(), /Finish the current board edit/)
  assert.deepEqual(canvas.getObjects(), [current])
  assert.equal(repository.puts.length, 0)
  service.dispose()
})

test('bootstrap keeps an unloadable board as recoverable', async () => {
  const sessionStorage = new MapStorage()
  sessionStorage.setItem('mathboard.activeBoardId', 'mb_corrupt')
  const records = new Map([['mb_corrupt', {
    id: 'mb_corrupt',
    title: 'Corrupt',
    document: { format: 'mathboard-board', version: 999, title: 'Corrupt', objects: [] },
  }]])
  const service = new BoardPersistenceService({
    repository: makeRepository(records), boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
  })
  const result = await service.bootstrap()
  assert.equal(result.restoreFailure.code, BOARD_PERSISTENCE_ERROR_CODES.BOARD_RESTORE_FAILED)
  assert.equal(result.restoreFailure.recoverable, true)
  assert.equal(sessionStorage.getItem('mathboard.recoveryBoardId'), 'mb_corrupt')
  assert.equal(records.has('mb_corrupt'), true)
  service.dispose()
})

test('opening the recovery board clears recovery metadata', async () => {
  const sessionStorage = new MapStorage()
  sessionStorage.setItem(RECOVERY_BOARD_ID_KEY, 'mb_recovery')
  const records = new Map([['mb_recovery', {
    id: 'mb_recovery',
    title: 'Recovered',
    updatedAt: '2026-10-08T00:00:00.000Z',
    document: { format: 'mathboard-board', version: 1, title: 'Recovered', objects: [] },
  }]])
  const service = new BoardPersistenceService({
    repository: makeRepository(records), boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
  })
  service.status = {
    ...service.status,
    recoveryFailure: { boardId: 'mb_recovery', recoverable: true },
  }

  await service.openBoard('mb_recovery')

  assert.equal(sessionStorage.getItem(RECOVERY_BOARD_ID_KEY), null)
  assert.equal(service.status.recoveryFailure, null)
  assert.equal(service.boardId, 'mb_recovery')
  service.dispose()
})

test('a fresh tab session bootstraps a new board and records it as active', async () => {
  const sessionStorage = new MapStorage()
  const records = new Map()
  const service = new BoardPersistenceService({
    repository: makeRepository(records), boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  const result = await service.bootstrap()

  assert.match(result.id, /^mb_/)
  assert.equal(service.boardId, result.id)
  assert.equal(records.has(result.id), true)
  assert.equal(records.get(result.id).kind, 'saved')
  assert.equal(sessionStorage.getItem('mathboard.activeBoardId'), service.boardId)
  service.dispose()
})

test('an active tab session restores its existing board without creating a replacement', async () => {
  const sessionStorage = new MapStorage()
  sessionStorage.setItem('mathboard.activeBoardId', 'mb_existing')
  const records = new Map([['mb_existing', {
    id: 'mb_existing',
    title: 'Existing',
    updatedAt: '2026-10-14T00:00:00.000Z',
    document: { format: 'mathboard-board', version: 1, title: 'Existing', objects: [] },
  }]])
  const repository = makeRepository(records)
  const service = new BoardPersistenceService({
    repository, boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  const result = await service.bootstrap()

  assert.equal(result.id, 'mb_existing')
  assert.equal(service.boardId, 'mb_existing')
  assert.equal(repository.puts.length, 0)
  assert.equal(records.size, 1)
  assert.equal(sessionStorage.getItem('mathboard.activeBoardId'), 'mb_existing')
  service.dispose()
})

test('adopting the current canvas creates a retained board owned by this tab', async () => {
  const sessionStorage = new MapStorage()
  const records = new Map()
  const repository = makeRepository(records)
  const service = new BoardPersistenceService({
    repository, boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  const record = await service.adoptCurrentCanvasAsNewBoard()

  assert.equal(record.kind, 'saved')
  assert.equal(records.get(record.id).kind, 'saved')
  assert.equal(sessionStorage.getItem('mathboard.activeBoardId'), record.id)
  assert.equal(service.boardId, record.id)
  service.dispose()
})

test('flush marks all persisted legacy records saved after writing', async () => {
  const sessionStorage = new MapStorage()
  const saved = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(saved, 'mbobj_rect')
  const records = new Map([
    ['mb_saved', {
      id: 'mb_saved',
      kind: 'saved',
      title: 'Saved',
      document: { format: 'mathboard-board', version: 1, title: 'Saved', objects: [] },
    }],
    ['mb_unknown', {
      id: 'mb_unknown',
      kind: 'future-kind',
      title: 'Future',
      document: { format: 'mathboard-board', version: 1, title: 'Future', objects: [] },
    }],
    ['mb_legacy', {
      id: 'mb_legacy',
      title: 'Legacy',
      document: { format: 'mathboard-board', version: 1, title: 'Legacy', objects: [] },
    }],
  ])
  const repository = makeRepository(records)
  const service = new BoardPersistenceService({
    repository, boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas([saved]), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  service.boardId = 'mb_saved'
  service.notifyDocumentChanged()
  await service.flush()
  assert.equal(repository.puts.at(-1).kind, 'saved')

  service.boardId = 'mb_unknown'
  service.revision = null
  service.notifyDocumentChanged()
  await service.flush()
  assert.equal(repository.puts.at(-1).kind, 'saved')

  service.boardId = 'mb_legacy'
  service.revision = null
  service.notifyDocumentChanged()
  await service.flush()
  assert.equal(repository.puts.at(-1).kind, 'saved')
  service.dispose()
})

test('bootstrap retains all historical scratch boards without age-based pruning', async () => {
  const nowMs = Date.parse('2026-10-14T00:00:00.000Z')
  const daysAgo = (days) => new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString()
  const sessionStorage = new MapStorage()
  sessionStorage.setItem('mathboard.activeBoardId', 'mb_active')
  sessionStorage.setItem(RECOVERY_BOARD_ID_KEY, 'mb_recovery')
  const document = { format: 'mathboard-board', version: 1, title: 'Board', objects: [] }
  const records = new Map([
    ['mb_active', { id: 'mb_active', kind: 'scratch', updatedAt: daysAgo(100), document }],
    ['mb_expired', { id: 'mb_expired', kind: 'scratch', updatedAt: daysAgo(31), document }],
    ['mb_recent', { id: 'mb_recent', kind: 'scratch', updatedAt: daysAgo(10), document }],
    ['mb_trashed', { id: 'mb_trashed', kind: 'scratch', updatedAt: daysAgo(100), trashedAt: daysAgo(90), document }],
    ['mb_saved', { id: 'mb_saved', kind: 'saved', updatedAt: daysAgo(200), document }],
    ['mb_unknown', { id: 'mb_unknown', kind: 'future-kind', updatedAt: daysAgo(200), document }],
    ['mb_legacy', { id: 'mb_legacy', updatedAt: daysAgo(200), document }],
    ['mb_recovery', { id: 'mb_recovery', kind: 'scratch', updatedAt: daysAgo(100), document }],
    ['mb_invalid', { id: 'mb_invalid', kind: 'scratch', updatedAt: 'not-a-date', createdAt: 'also-not-a-date', document }],
  ])
  const repository = makeRepository(records)
  const service = new BoardPersistenceService({
    repository, boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  await service.bootstrap()

  assert.deepEqual([...records.keys()].sort(), [
    'mb_active',
    'mb_expired',
    'mb_invalid',
    'mb_legacy',
    'mb_recent',
    'mb_recovery',
    'mb_saved',
    'mb_trashed',
    'mb_unknown',
  ])
  assert.deepEqual(repository.deletes, [])
  assert.equal(service.boardId, 'mb_active')
  service.dispose()
})

test('bootstrap does not require listing local boards for cleanup', async () => {
  const sessionStorage = new MapStorage()
  const repository = makeRepository()
  repository.list = async () => {
    throw new Error('list failed')
  }
  const service = new BoardPersistenceService({
    repository, boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, sessionStorage,
    now: () => '2026-10-14T00:00:00.000Z',
  })

  const result = await service.bootstrap()

  assert.match(result.id, /^mb_/)
  assert.equal(service.boardId, result.id)
  assert.equal(sessionStorage.getItem('mathboard.activeBoardId'), service.boardId)
  service.dispose()
})

test('a change during an in-flight save stays dirty until the next flush', async () => {
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_rect')
  let releaseFirstPut
  let puts = 0
  const repository = makeRepository(new Map([['mb_current', { id: 'mb_current', kind: 'saved', title: 'Board', document: { format: 'mathboard-board', version: 1, title: 'Board', objects: [] } }]]))
  const update = repository.updateIfRevisionMatches.bind(repository)
  repository.updateIfRevisionMatches = async (...args) => {
    puts += 1
    if (puts === 1) await new Promise((resolve) => { releaseFirstPut = resolve })
    return update(...args)
  }
  const service = makeService({ canvas: makeCanvas([rect]), repository })
  service.boardId = 'mb_current'
  service.notifyDocumentChanged()
  const firstSave = service.flush()
  await new Promise((resolve) => setTimeout(resolve, 0))
  service.notifyDocumentChanged()
  releaseFirstPut()
  await firstSave

  assert.equal(service.status.state, SAVE_STATES.DIRTY)
  await service.flush()
  assert.equal(puts, 2)
  assert.equal(service.status.state, SAVE_STATES.CLEAN)
  service.dispose()
})

test('implicit board creation and Stamp adoption use generated titles', async () => {
  const service = makeService()
  const blank = await service.createNewBoard()
  assert.match(blank.title, /^[a-z]+-[a-z]+$/)
  assert.equal(blank.document.title, blank.title)
  const adopted = await service.adoptCurrentCanvasAsNewBoard()
  assert.match(adopted.title, /^[a-z]+-[a-z]+$/)
  assert.equal(adopted.document.title, adopted.title)
  assert.equal(service.title, adopted.title)
  service.dispose()
})
