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
    async put(record) {
      this.puts.push(record)
      records.set(record.id, record)
      return record
    },
    async list() {
      return [...records.values()]
    },
    async delete(id) {
      this.deletes.push(id)
      records.delete(id)
    },
  }
}

function makeService({ canvas = makeCanvas(), repository = makeRepository(), isDocumentStable } = {}) {
  return new BoardPersistenceService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => canvas,
    buildFormula: async () => null,
    resetHistory: () => {},
    suspendHistory: () => {},
    getTitle: () => 'Board',
    sessionStorage: new MapStorage(),
    now: () => '2026-10-08T00:00:00.000Z',
    idleDebounceMs: 60000,
    maxWaitMs: 60000,
    isDocumentStable,
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

test('flush defers an unstable document until it becomes committed', async () => {
  const rect = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(rect, 'mbobj_rect')
  const repository = makeRepository()
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

test('failed flush blocks opening another board and preserves the current canvas', async () => {
  const current = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(current, 'mbobj_current')
  const canvas = makeCanvas([current])
  const repository = makeRepository(new Map([['mb_target', {
    id: 'mb_target',
    title: 'Target',
    document: { format: 'mathboard-board', version: 1, title: 'Target', objects: [] },
  }]]))
  repository.put = async () => {
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

test('new board write failure preserves the current runtime', async () => {
  const current = new Rect({ width: 10, height: 10 })
  ensureMathBoardObjectId(current, 'mbobj_current')
  const canvas = makeCanvas([current])
  const repository = makeRepository()
  repository.put = async () => {
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
  assert.equal(records.get(result.id).kind, 'scratch')
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

test('adopting the current canvas creates a scratch board owned by this tab', async () => {
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

  assert.equal(record.kind, 'scratch')
  assert.equal(records.get(record.id).kind, 'scratch')
  assert.equal(sessionStorage.getItem('mathboard.activeBoardId'), record.id)
  assert.equal(service.boardId, record.id)
  service.dispose()
})

test('flush preserves explicit record kinds and upgrades legacy records to scratch', async () => {
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
  service.notifyDocumentChanged()
  await service.flush()
  assert.equal(repository.puts.at(-1).kind, 'future-kind')

  service.boardId = 'mb_legacy'
  service.notifyDocumentChanged()
  await service.flush()
  assert.equal(repository.puts.at(-1).kind, 'scratch')
  service.dispose()
})

test('scratch garbage collection only deletes expired unprotected scratch records', async () => {
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
    'mb_invalid',
    'mb_legacy',
    'mb_recent',
    'mb_recovery',
    'mb_saved',
    'mb_trashed',
    'mb_unknown',
  ])
  assert.deepEqual(repository.deletes, ['mb_expired'])
  assert.equal(service.boardId, 'mb_active')
  service.dispose()
})

test('a scratch cleanup failure does not block bootstrap', async () => {
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
  const repository = makeRepository()
  repository.put = async (record) => {
    puts += 1
    if (puts === 1) await new Promise((resolve) => { releaseFirstPut = resolve })
    return record
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
