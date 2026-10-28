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
import { Rect, Path } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardLifecycle } from '../src/board/BoardLifecycle.js'
import { FormulaObject } from '../src/formulas/FormulaObject.js'
import { IndexedDbBoardRepository, createBoardRecord } from '../src/storage/local/IndexedDbBoardRepository.js'
import { openMathBoardDb } from '../src/storage/local/indexedDb.js'
import { BoardDocumentCommandService } from '../src/board/BoardDocumentCommandService.js'

installFabricDomStub()

function documentWith(objects = []) {
  return { format: 'mathboard-board', version: 1, title: 'Board', objects }
}

async function fixture() {
  const repository = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  const activeId = `mb_${globalThis.crypto.randomUUID()}`
  const targetId = `mb_${globalThis.crypto.randomUUID()}`
  await repository.create(createBoardRecord({ id: activeId, document: documentWith() }))
  await repository.create(createBoardRecord({ id: targetId, document: documentWith() }))
  const visible = makeControllerCanvas([new Rect({ width: 7, height: 7 })])
  const lifecycle = new BoardLifecycle()
  let currentId = activeId
  let disposed = 0
  const service = new BoardDocumentCommandService({
    repository,
    boardObjectPolicy: new BoardObjectPolicy(),
    lifecycle,
    getActiveBoardId: () => currentId,
    getActiveController: () => { throw new Error('Inactive command touched live controller') },
    createCanvas: () => {
      const canvas = makeControllerCanvas()
      canvas.dispose = async () => { disposed += 1 }
      return canvas
    },
    buildFormula: async spec => new FormulaObject([new Path('M 0 0 L 20 20')], { ...spec, latex: spec.latex }),
  })
  return { repository, activeId, targetId, visible, lifecycle, service,
    setCurrentId: id => { currentId = id }, disposed: () => disposed }
}

test('inactive create persists B without changing visible A or its history', async () => {
  const { repository, activeId, targetId, visible, service, disposed } = await fixture()
  const before = visible.getObjects()
  const created = await service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'rect', left: 30, top: 40, width: 10, height: 20 } } },
  { expiresAtMs: Date.now() + 10000 })
  const saved = await repository.get(targetId)
  assert.equal(saved.revision, 2)
  assert.deepEqual(saved.document.objects.map(object => object.id), [created.id])
  assert.deepEqual(visible.getObjects(), before)
  assert.equal((await repository.get(activeId)).revision, 1)
  assert.equal(disposed(), 1)
})

test('inactive no-op does not increment revision and layout requires the visible context', async () => {
  const { repository, targetId, service } = await fixture()
  assert.deepEqual(await service.executeOnBoard({ boardId: targetId, method: 'clear', params: {} },
    { expiresAtMs: Date.now() + 10000 }), [])
  assert.equal((await repository.get(targetId)).revision, 1)
  await assert.rejects(() => service.executeOnBoard({ boardId: targetId, method: 'layout', params: {} },
    { expiresAtMs: Date.now() + 10000 }), { code: 'board_context_required' })
})

test('inactive formula aborts when its target becomes active before commit', async () => {
  const { repository, targetId, service, setCurrentId, disposed } = await fixture()
  let finishFormula
  service._buildFormula = () => new Promise(resolve => { finishFormula = resolve })
  const pending = service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'formula', latex: 'x=1', left: 20, top: 30 } } },
  { expiresAtMs: Date.now() + 10000 })
  await new Promise(resolve => setImmediate(resolve))
  setCurrentId(targetId)
  finishFormula(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' }))
  await assert.rejects(pending, { code: 'board_context_changed' })
  assert.equal((await repository.get(targetId)).revision, 1)
  assert.equal(disposed(), 1)
})

test('A to B to A lifecycle transition fences an inactive request', async () => {
  const { repository, activeId, targetId, service, setCurrentId, lifecycle } = await fixture()
  let finishFormula
  service._buildFormula = () => new Promise(resolve => { finishFormula = resolve })
  const pending = service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'formula', latex: 'x=1' } } },
  { expiresAtMs: Date.now() + 10000 })
  await new Promise(resolve => setImmediate(resolve))
  await lifecycle.transition(async () => {
    setCurrentId(targetId)
    setCurrentId(activeId)
  })
  finishFormula(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' }))
  await assert.rejects(pending, { code: 'board_context_changed' })
  assert.equal((await repository.get(targetId)).revision, 1)
})

test('inactive command loses CAS when another repository commits first', async () => {
  const { repository, targetId, service } = await fixture()
  const other = new IndexedDbBoardRepository({ openDb: () => openMathBoardDb(fakeIndexedDB) })
  let finishFormula
  service._buildFormula = () => new Promise(resolve => { finishFormula = resolve })
  const pending = service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'formula', latex: 'x=1' } } },
  { expiresAtMs: Date.now() + 10000 })
  await new Promise(resolve => setImmediate(resolve))
  await other.updateIfRevisionMatches(targetId, 1, current => ({ ...current, title: 'Other writer' }))
  finishFormula(new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' }))
  await assert.rejects(pending, { code: 'board_conflict' })
  assert.equal((await repository.get(targetId)).title, 'Other writer')
  assert.deepEqual((await repository.get(targetId)).document.objects, [])
})

test('inactive command subset persists semantic IDs, z-order, and one revision per mutation', async () => {
  const { repository, targetId, service } = await fixture()
  const run = (method, params = {}) => service.executeOnBoard({ boardId: targetId, method, params },
    { expiresAtMs: Date.now() + 10000 })
  const created = await run('createMany', { specs: [
    { type: 'rect', width: 10, height: 10, left: 1 },
    { type: 'rect', width: 20, height: 20, left: 2 },
    { type: 'rect', width: 30, height: 30, left: 3 },
  ] })
  await run('update', { id: created[1].id, patch: { left: 50 } })
  const measured = await run('measure', { id: created[1].id })
  assert.equal(measured.id, created[1].id)
  const group = await run('group', { ids: [created[0].id, created[1].id] })
  await assert.rejects(() => run('delete', { id: created[0].id }),
    { code: 'nested_object_mutation_not_supported' })
  assert.deepEqual((await repository.get(targetId)).document.objects.map(object => object.id),
    [created[2].id, group.id])
  await run('delete', { id: created[2].id })
  await run('deleteMany', { ids: [group.id] })
  assert.deepEqual((await repository.get(targetId)).document.objects, [])
  assert.equal((await repository.get(targetId)).revision, 6)
  await run('deleteMany', { ids: [] })
  await run('clear')
  assert.equal((await repository.get(targetId)).revision, 6)
})

test('missing, archived, and malformed targets cannot execute an inactive mutation', async () => {
  const { repository, targetId, service } = await fixture()
  const command = boardId => service.executeOnBoard({ boardId, method: 'create',
    params: { spec: { type: 'rect', width: 10, height: 10 } } },
  { expiresAtMs: Date.now() + 10000 })
  await assert.rejects(() => command('wrong'), { code: 'invalid_board_id' })
  await assert.rejects(() => command(`mb_${'x'.repeat(200)}`), { code: 'invalid_board_id' })
  await assert.rejects(() => command('mb_missing'), { code: 'board_not_found' })
  await repository.updateIfRevisionMatches(targetId, 1, current => ({ ...current, archivedAt: '2026-10-28T00:00:00Z' }))
  await assert.rejects(() => command(targetId), { code: 'board_archived' })
  assert.deepEqual((await repository.get(targetId)).document.objects, [])
})

test('deadline expiring while storage waits aborts before the conditional write', async () => {
  const { repository, targetId, service } = await fixture()
  const update = repository.updateIfRevisionMatches.bind(repository)
  let release
  repository.updateIfRevisionMatches = (...args) => new Promise(resolve => {
    release = () => resolve(update(...args))
  })
  const pending = service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'rect', width: 10, height: 10 } } },
  { expiresAtMs: Date.now() + 20 })
  await new Promise(resolve => setTimeout(resolve, 30))
  release()
  await assert.rejects(pending, { code: 'command_timeout' })
  assert.equal((await repository.get(targetId)).revision, 1)
})

test('active mutation that commits before its context changes reports an unknown outcome', async () => {
  const { activeId, targetId, service, setCurrentId } = await fixture()
  service._getActiveController = () => ({ create: () => {
    setCurrentId(targetId)
    return { id: 'mbobj_done', type: 'rect' }
  } })
  await assert.rejects(() => service.executeOnBoard({ boardId: activeId, method: 'create',
    params: { spec: { type: 'rect', width: 10, height: 10 } } },
  { expiresAtMs: Date.now() + 10000 }), { code: 'execution_unknown' })
})

test('active addressed commands reject an externally archived target before dispatch', async () => {
  const { repository, activeId, service } = await fixture()
  let called = false
  service._getActiveController = () => ({ observe: () => { called = true; return {} } })
  await repository.updateIfRevisionMatches(activeId, 1, current => ({ ...current, archivedAt: '2026-10-28T00:00:00Z' }))
  await assert.rejects(() => service.executeOnBoard({ boardId: activeId, method: 'observe', params: {} },
    { expiresAtMs: Date.now() + 10000 }), { code: 'board_archived' })
  assert.equal(called, false)
})

test('request method and parameters are captured before storage awaits', async () => {
  const { repository, targetId, service } = await fixture()
  const read = repository.get.bind(repository)
  let release
  repository.get = () => new Promise(resolve => { release = () => resolve(read(targetId)) })
  const command = { boardId: targetId, method: 'create',
    params: { spec: { type: 'rect', width: 10, height: 10 } } }
  const pending = service.executeOnBoard(command, { expiresAtMs: Date.now() + 10000 })
  command.method = 'layout'
  command.params.spec.width = 999
  release()
  const created = await pending
  assert.equal(created.width, 10)
  assert.equal((await read(targetId)).document.objects[0].width, 10)
})

test('unresponsive formula rendering releases the detached canvas at the deadline', { timeout: 500 }, async () => {
  const { targetId, service, disposed } = await fixture()
  let resolveFormula
  service._buildFormula = () => new Promise(resolve => { resolveFormula = resolve })
  await assert.rejects(() => service.executeOnBoard({ boardId: targetId, method: 'create',
    params: { spec: { type: 'formula', latex: 'x=1' } } },
  { expiresAtMs: Date.now() + 20 }), { code: 'command_timeout' })
  assert.equal(disposed(), 1)
  const late = new FormulaObject([new Path('M 0 0 L 20 20')], { latex: 'x=1' })
  let lateDisposed = false
  const dispose = late.dispose.bind(late)
  late.dispose = (...args) => { lateDisposed = true; return dispose(...args) }
  resolveFormula(late)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(lateDisposed, true)
})
