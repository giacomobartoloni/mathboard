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
    async get(id) {
      return records.get(id) || null
    },
    async put(record) {
      this.puts.push(record)
      records.set(record.id, record)
      return record
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
    storage: new MapStorage(),
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
  const storage = new MapStorage()
  storage.setItem('mathboard.lastBoardId', 'mb_missing')
  const repository = makeRepository()
  const service = new BoardPersistenceService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(),
    buildFormula: async () => null,
    resetHistory: () => {},
    suspendHistory: () => {},
    storage,
    now: () => '2026-10-08T00:00:00.000Z',
  })

  const result = await service.bootstrap()

  assert.equal(result.restoreFailure.boardId, 'mb_missing')
  assert.equal(result.restoreFailure.code, BOARD_PERSISTENCE_ERROR_CODES.BOARD_NOT_FOUND)
  assert.equal(storage.getItem('mathboard.recoveryBoardId'), null)
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
  const storage = new MapStorage()
  storage.setItem('mathboard.lastBoardId', 'mb_corrupt')
  const records = new Map([['mb_corrupt', {
    id: 'mb_corrupt',
    title: 'Corrupt',
    document: { format: 'mathboard-board', version: 999, title: 'Corrupt', objects: [] },
  }]])
  const service = new BoardPersistenceService({
    repository: makeRepository(records), boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, storage,
  })
  const result = await service.bootstrap()
  assert.equal(result.restoreFailure.code, BOARD_PERSISTENCE_ERROR_CODES.BOARD_RESTORE_FAILED)
  assert.equal(result.restoreFailure.recoverable, true)
  assert.equal(storage.getItem('mathboard.recoveryBoardId'), 'mb_corrupt')
  assert.equal(records.has('mb_corrupt'), true)
  service.dispose()
})

test('opening the recovery board clears recovery metadata', async () => {
  const storage = new MapStorage()
  storage.setItem(RECOVERY_BOARD_ID_KEY, 'mb_recovery')
  const records = new Map([['mb_recovery', {
    id: 'mb_recovery',
    title: 'Recovered',
    updatedAt: '2026-10-08T00:00:00.000Z',
    document: { format: 'mathboard-board', version: 1, title: 'Recovered', objects: [] },
  }]])
  const service = new BoardPersistenceService({
    repository: makeRepository(records), boardObjectPolicy: new BoardObjectPolicy(),
    getCanvas: () => makeCanvas(), buildFormula: async () => null,
    resetHistory: () => {}, suspendHistory: () => {}, storage,
  })
  service.status = {
    ...service.status,
    recoveryFailure: { boardId: 'mb_recovery', recoverable: true },
  }

  await service.openBoard('mb_recovery')

  assert.equal(storage.getItem(RECOVERY_BOARD_ID_KEY), null)
  assert.equal(service.status.recoveryFailure, null)
  assert.equal(service.boardId, 'mb_recovery')
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
