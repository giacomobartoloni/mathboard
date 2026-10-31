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

test('D12: edits during an in-flight save prevent switching until the newer snapshot is durable', async t => {
  const context = fixture()
  t.after(() => context.persistence.dispose())
  const lesson = await composeLesson(context)
  const baseline = await context.execute(lesson.lesson.id, 'observe')
  assert.equal(baseline.objects.length, 25)

  const originalUpdate = context.repository.updateIfRevisionMatches.bind(context.repository)
  let releaseSave
  const blockedSave = new Promise(resolve => { releaseSave = resolve })
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
    // The first flush snapshots 25 objects, then waits before committing to IndexedDB.
    const saving = context.persistence.flush()
    await saveStarted
    await context.execute(lesson.lesson.id, 'update', {
      id: lesson.verificationIds[0], patch: { left: 910 },
    })
    const marker = await context.execute(lesson.lesson.id, 'create', {
      spec: { type: 'rect', left: 940, top: 500, width: 18, height: 12 },
    })
    const latest = await context.execute(lesson.lesson.id, 'observe')
    assert.equal(latest.objects.length, 26)
    assert.equal(latest.revision, baseline.revision)
    assert.deepEqual(
      lesson.verificationIds.map(id => latest.objects.find(node => node.id === id)?.left),
      [910, 820, 820],
    )
    assert.equal(latest.objects.find(node => node.id === marker.id)?.left, 940)
    const latestState = lessonState(latest, lesson.verificationIds, lesson.curveId)

    // A transition may not install another board while the first snapshot is stale.
    const switching = context.workspace.create({ title: 'Second board' }).then(
      board => ({ board }),
      error => ({ error }),
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(context.persistence.boardId, lesson.lesson.id)

    releaseSave()
    await saving
    const outcome = await switching
    assert.match(outcome.error?.message ?? '', /Current board must be saved before switching boards/)
    assert.equal(context.persistence.boardId, lesson.lesson.id)
    assert.equal(context.persistence.status.state, 'dirty')

    const firstSaved = await context.repository.get(lesson.lesson.id)
    assert.equal(firstSaved.revision, baseline.revision + 1)
    assert.equal(firstSaved.document.objects.length, 25)
    assert.equal(firstSaved.document.objects.find(node => node.id === lesson.verificationIds[0])?.left, 820)
    assert.ok(!firstSaved.document.objects.some(node => node.id === marker.id))
    const stillLive = await context.execute(lesson.lesson.id, 'observe')
    assert.equal(stillLive.revision, firstSaved.revision)
    assert.deepEqual(lessonState(stillLive, lesson.verificationIds, lesson.curveId), latestState)

    // The second flush writes both late edits; retrying the board switch is now safe.
    await context.persistence.flush()
    const finalSaved = await context.repository.get(lesson.lesson.id)
    assert.equal(finalSaved.revision, firstSaved.revision + 1)
    assert.equal(finalSaved.document.objects.length, 26)
    assert.equal(finalSaved.document.objects.find(node => node.id === marker.id)?.left, 940)
    assert.equal(finalSaved.document.objects.find(node => node.id === lesson.verificationIds[0])?.left, 910)

    const second = await context.workspace.create({ title: 'Second board' })
    assert.equal(context.persistence.boardId, second.id)
    const inactive = await context.execute(lesson.lesson.id, 'observe')
    assert.equal(inactive.revision, finalSaved.revision)
    assert.deepEqual(lessonState(inactive, lesson.verificationIds, lesson.curveId), latestState)
    assert.equal(inactive.objects.find(node => node.id === marker.id)?.left, 940)

    await context.workspace.open({ boardId: lesson.lesson.id })
    const reopened = await context.execute(lesson.lesson.id, 'observe')
    assert.deepEqual(lessonState(reopened, lesson.verificationIds, lesson.curveId), latestState)
    assert.equal(reopened.objects.find(node => node.id === marker.id)?.left, 940)
  } finally {
    releaseSave()
  }
})
