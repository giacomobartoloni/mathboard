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
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardLifecycle } from '../src/board/BoardLifecycle.js'
import { BoardController } from '../src/board/BoardController.js'
import { BoardDocumentCommandService } from '../src/board/BoardDocumentCommandService.js'
import { BoardWorkspaceService } from '../src/board/BoardWorkspaceService.js'
import { BoardPersistenceService } from '../src/board/persistence/BoardPersistenceService.js'
import { BoardHistory } from '../src/history/BoardHistory.js'
import { IndexedDbBoardRepository } from '../src/storage/local/IndexedDbBoardRepository.js'
import { openMathBoardDb } from '../src/storage/local/indexedDb.js'

installFabricDomStub()

function makeCanvas() {
  const canvas = makeControllerCanvas()
  canvas.add = object => canvas.insertAt(canvas.getObjects().length, object)
  canvas.dispose = async () => {}
  return canvas
}

function fixture() {
  const canvas = makeCanvas()
  const lifecycle = new BoardLifecycle()
  const policy = new BoardObjectPolicy()
  const repository = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  const session = new Map()
  let persistence
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged: () => persistence.notifyDocumentChanged(),
    syncAutoInk: () => {},
  })
  persistence = new BoardPersistenceService({
    repository,
    boardObjectPolicy: policy,
    getCanvas: () => canvas,
    buildFormula: async () => null,
    resetHistory: () => history.reset(),
    suspendHistory: suspended => history.setSuspended(suspended),
    isDocumentStable: () => true,
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, value),
      removeItem: key => session.delete(key),
    },
    lifecycle,
    // Keep autosave pending until a transition explicitly flushes the board.
    idleDebounceMs: 60_000,
    maxWaitMs: 60_000,
  })
  const makeController = (commitGuard = () => {}, buildFormula = async () => null) => new BoardController({
    getCanvas: () => canvas,
    boardObjectPolicy: policy,
    buildFormula,
    pushHistoryCommand: command => history.record(command),
    runWithoutHistory: callback => history.runSuspended(callback),
    isMutationStable: () => true,
    getBoardId: () => persistence.boardId,
    lifecycle,
    commitGuard,
  })
  const workspace = new BoardWorkspaceService(persistence)
  const commands = new BoardDocumentCommandService({
    repository,
    boardObjectPolicy: policy,
    lifecycle,
    getActiveBoardId: () => persistence.boardId,
    getActiveRevision: () => persistence.revision,
    getActiveController: makeController,
    buildFormula: async () => null,
    createCanvas: makeCanvas,
  })
  const execute = (boardId, method, params = {}) => commands.executeOnBoard(
    { boardId, method, params },
    { expiresAtMs: Date.now() + 10_000 },
  )
  return { repository, persistence, history, workspace, execute }
}

async function composeLesson({ workspace, execute, history }) {
  const lesson = await workspace.create({ title: 'Quadratic lesson' })
  const specs = [
    ...Array.from({ length: 21 }, (_, i) => ({
      type: 'rect', width: 12, height: 8, left: 30 + i * 15, top: 100,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      type: 'text', text: `Verification ${i + 1}`, left: 420, top: 150 + i * 32,
    })),
  ]
  const nodes = await execute(lesson.id, 'createMany', { specs })
  assert.equal(nodes.length, 24)
  const verificationIds = nodes.slice(-3).map(node => node.id)
  for (const id of verificationIds) {
    await execute(lesson.id, 'update', { id, patch: { left: 820 } })
  }
  const curve = await execute(lesson.id, 'create', {
    spec: { type: 'path', path: [
      ['M', 64, 532], ['L', 101.5, 565.25], ['Q', 140, 580, 176.5, 532],
    ] },
  })
  assert.equal(history.summary().length, 5)
  return { lesson, verificationIds, curveId: curve.id }
}

function lessonState(observation, verificationIds, curveId) {
  const objects = observation.objects
  const indexed = new Map(objects.map(node => [node.id, node]))
  const curve = indexed.get(curveId)
  return {
    ids: objects.map(node => node.id),
    verification: verificationIds.map(id => ({ id, left: indexed.get(id)?.left })),
    curve: curve ? { id: curve.id, path: curve.path } : null,
  }
}

async function assertLessonPreserved({ repository, workspace, persistence, execute, history },
  { lesson, verificationIds, curveId }, before) {
  const next = await workspace.create({ title: 'Second board' })
  assert.equal(persistence.boardId, next.id)
  assert.equal(history.summary().length, 0)

  const persisted = await repository.get(lesson.id)
  assert.equal(persisted.revision, before.revision + 1)
  assert.equal(persisted.document.objects.length, 25)

  const inactive = await execute(lesson.id, 'observe')
  assert.equal(inactive.viewport, null)
  assert.equal(inactive.revision, persisted.revision)
  assert.deepEqual(lessonState(inactive, verificationIds, curveId), before.state)

  await workspace.open({ boardId: lesson.id })
  assert.equal(persistence.boardId, lesson.id)
  const reopened = await execute(lesson.id, 'observe')
  assert.equal(reopened.revision, persisted.revision)
  assert.deepEqual(lessonState(reopened, verificationIds, curveId), before.state)
}

test('D12: A to B to A preserves acknowledged objects and coordinates across the flush', async t => {
  const context = fixture()
  t.after(() => context.persistence.dispose())
  const lesson = await composeLesson(context)
  const live = await context.execute(lesson.lesson.id, 'observe')
  assert.equal(live.objects.length, 25)
  assert.deepEqual(
    lesson.verificationIds.map(id => live.objects.find(node => node.id === id)?.left),
    [820, 820, 820],
  )
  assert.ok(live.objects.some(node => node.id === lesson.curveId))
  const before = {
    revision: live.revision,
    state: lessonState(live, lesson.verificationIds, lesson.curveId),
  }
  await assertLessonPreserved(context, lesson, before)
})

test('D12: switching boards waits for a pending IndexedDB save', async t => {
  const context = fixture()
  t.after(() => context.persistence.dispose())
  const lesson = await composeLesson(context)
  const live = await context.execute(lesson.lesson.id, 'observe')
  const before = {
    revision: live.revision,
    state: lessonState(live, lesson.verificationIds, lesson.curveId),
  }
  const originalUpdate = context.repository.updateIfRevisionMatches.bind(context.repository)
  let unblockSave
  const blockedSave = new Promise(resolve => { unblockSave = resolve })
  let signalSaveStarted
  const saveStarted = new Promise(resolve => { signalSaveStarted = resolve })
  let held = false
  context.repository.updateIfRevisionMatches = async (...args) => {
    if (!held && args[0] === lesson.lesson.id) {
      held = true
      signalSaveStarted()
      await blockedSave
    }
    return originalUpdate(...args)
  }

  try {
    const saving = context.persistence.flush()
    await saveStarted
    let switched = false
    const switching = context.workspace.create({ title: 'Second board' })
      .then(result => { switched = true; return result })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(switched, false)
    assert.equal(context.persistence.boardId, lesson.lesson.id)

    unblockSave()
    await saving
    await switching
    const persisted = await context.repository.get(lesson.lesson.id)
    assert.equal(persisted.revision, before.revision + 1)
    assert.deepEqual(persisted.document.objects.map(node => node.id), before.state.ids)

    const inactive = await context.execute(lesson.lesson.id, 'observe')
    assert.deepEqual(lessonState(inactive, lesson.verificationIds, lesson.curveId), before.state)
    await context.workspace.open({ boardId: lesson.lesson.id })
    const reopened = await context.execute(lesson.lesson.id, 'observe')
    assert.deepEqual(lessonState(reopened, lesson.verificationIds, lesson.curveId), before.state)
  } finally {
    unblockSave()
  }
})
