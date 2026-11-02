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
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardController, BOARD_CONTROLLER_ERROR_CODES } from '../src/board/BoardController.js'
import { BoardHistory } from '../src/history/BoardHistory.js'

installFabricDomStub()

test('real BoardHistory gives createMany a single undo step and rolls back rejected notifications', async () => {
  const canvas = makeControllerCanvas()
  let fail = false
  let notifications = 0
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged: () => { notifications++; if (fail) throw new Error('storage unavailable') },
    syncAutoInk: () => {},
  })
  const controller = new BoardController({
    getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async () => { throw new Error('formula unused') },
    pushHistoryCommand: (command) => history.record(command),
    runWithoutHistory: (callback) => history.runSuspended(callback),
    isMutationStable: () => true,
  })
  const specs = [
    { type: 'rect', left: 100, top: 120, width: 60, height: 40 },
    { type: 'rect', left: 220, top: 120, width: 50, height: 30 },
  ]
  await controller.createMany(specs)
  const retained = canvas.getObjects()
  assert.deepEqual(history.summary(), { length: 1, step: 0, tipType: 'batch-add' })
  history.undo()
  assert.deepEqual(canvas.getObjects(), [])
  history.redo()
  assert.deepEqual(canvas.getObjects(), retained)
  fail = true
  await assert.rejects(() => controller.createMany(specs),
    (error) => error.code === BOARD_CONTROLLER_ERROR_CODES.COMMIT_FAILED)
  assert.deepEqual(canvas.getObjects(), retained)
  assert.deepEqual(history.summary(), { length: 1, step: 0, tipType: 'batch-add' })
  assert.equal(notifications, 2)
  fail = false
  history.undo()
  assert.deepEqual(canvas.getObjects(), [])
})

test('a suspended real history rejects a controller commit and leaves no board effect', async () => {
  const canvas = makeControllerCanvas()
  const history = new BoardHistory({
    getCanvas: () => canvas,
    onDocumentChanged: () => {},
    syncAutoInk: () => {},
  })
  const effects = []
  const controller = new BoardController({
    getCanvas: () => canvas,
    boardObjectPolicy: new BoardObjectPolicy(),
    buildFormula: async () => { throw new Error('formula unused') },
    pushHistoryCommand: (command) => history.record(command),
    runWithoutHistory: (callback) => history.runSuspended(callback),
    isMutationStable: () => true,
    onCommittedOperation: (effect) => effects.push(effect),
  })
  history.setSuspended(true)
  await assert.rejects(() => controller.create({ type: 'rect', width: 20, height: 20 }),
    (error) => error.code === BOARD_CONTROLLER_ERROR_CODES.COMMIT_FAILED)
  assert.equal(canvas.getObjects().length, 0)
  assert.deepEqual(history.summary(), { length: 0, step: -1, tipType: null })
  assert.deepEqual(effects, [])
})
