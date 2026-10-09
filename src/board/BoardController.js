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

import { ActiveSelection } from 'fabric'
import { getMathBoardObjectId, ensureMathBoardObjectId, regenerateMathBoardObjectIds } from './ids.js'
import { materializeBoardObjects } from './objects/materialize.js'
import { readSemanticBoardObject, toBoardDocumentNode } from './objects/serialize.js'
import { validateCreateSpec, validateObjectPatch } from './objects/validateCreateSpec.js'
import { TRANSFORM_KEYS } from './objects/constants.js'
import { snapshotObject, snapshotsEqual, applySnapshot } from '../history/commandLog.js'
import { serializeBoardState } from './observe/serializeBoardState.js'
import { BoardControllerError, BOARD_CONTROLLER_ERROR_CODES as C } from './BoardControllerError.js'

export { BoardControllerError, BOARD_CONTROLLER_ERROR_CODES } from './BoardControllerError.js'

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = node.objects && findNode(node.objects, id)
    if (child) return child
  }
  return null
}

/** Canvas-bound local application API. Mutations commit through the injected history boundary. */
export class BoardController {
  constructor({ getCanvas, boardObjectPolicy, buildFormula, pushHistoryCommand,
    runWithoutHistory = (fn) => fn(), prepareCreatedObject = () => {},
    afterMutation = () => {}, getBoardId = () => null }) {
    this._getCanvas = getCanvas
    this._policy = boardObjectPolicy
    this._buildFormula = buildFormula
    this._pushHistoryCommand = pushHistoryCommand
    this._runWithoutHistory = runWithoutHistory
    this._prepareCreatedObject = prepareCreatedObject
    this._afterMutation = afterMutation
    this._getBoardId = getBoardId
  }

  _canvas() {
    const canvas = this._getCanvas?.()
    if (!canvas) throw new BoardControllerError(C.NOT_READY, 'Board canvas is not ready.')
    return canvas
  }

  _read(object) {
    return structuredClone(toBoardDocumentNode(readSemanticBoardObject(object, { boardObjectPolicy: this._policy })))
  }

  getObjects() {
    return this._canvas().getObjects().map((object) => this._read(object))
  }

  get(id) {
    return findNode(this.getObjects(), id)
  }

  _target(canvas, id) {
    const object = canvas.getObjects().find((item) => getMathBoardObjectId(item) === id)
    if (object) return object
    if (this.get(id)) throw new BoardControllerError(C.NESTED_OBJECT_UNSUPPORTED, 'Nested object mutation is not supported.')
    throw new BoardControllerError(C.OBJECT_NOT_FOUND, `Object not found: ${id}`)
  }

  async _materialize(specs) {
    try {
      return await materializeBoardObjects(specs, {
        restoreIds: false,
        buildFormula: async (spec) => {
          try {
            const formula = await this._buildFormula(spec)
            if (!formula) throw new Error('Formula render failed.')
            return formula
          } catch (cause) {
            throw new BoardControllerError(C.FORMULA_RENDER_FAILED, 'Formula render failed.', { cause })
          }
        },
      })
    } catch (cause) {
      if (cause instanceof BoardControllerError) throw cause
      throw new BoardControllerError(C.INVALID_SPEC, 'Cannot materialize object spec.', { cause })
    }
  }

  _select(canvas, objects) {
    canvas.discardActiveObject()
    canvas.setActiveObject(objects.length === 1 ? objects[0] : new ActiveSelection(objects, { canvas }))
  }

  _selectionContains(canvas, object) {
    return canvas.getActiveObjects().includes(object)
  }

  _assertCanMutate(canvas) {
    if (canvas.getObjects().some((object) => object.isEditing)) {
      throw new BoardControllerError(C.COMMIT_FAILED, 'Finish the current text edit before a programmable mutation.')
    }
  }

  _rollback(steps) {
    const errors = []
    for (const step of steps) {
      try { step() } catch (error) { errors.push(error) }
    }
    if (errors.length) throw new globalThis.AggregateError(errors, 'Board rollback encountered errors.')
  }

  _commit(canvas, change, rollback, command, readResult) {
    this._assertCanMutate(canvas)
    const previous = canvas.renderOnAddRemove
    canvas.renderOnAddRemove = false
    let result
    try {
      this._runWithoutHistory(change)
      result = readResult()
      const entry = typeof command === 'function' ? command() : command
      if (entry) this._pushHistoryCommand(entry)
    } catch (cause) {
      let failure = cause
      try {
        this._runWithoutHistory(rollback)
      } catch (rollbackError) {
        failure = new globalThis.AggregateError([cause, rollbackError], 'Board commit and rollback encountered errors.')
      }
      throw new BoardControllerError(C.COMMIT_FAILED, 'Board mutation could not be committed.', { cause: failure })
    } finally {
      canvas.renderOnAddRemove = previous
      canvas.requestRenderAll()
    }
    this._afterMutation()
    return result
  }

  async _create(specs, options, batch) {
    const canvas = this._canvas()
    this._assertCanMutate(canvas)
    if (!Array.isArray(specs) || !specs.length) throw new BoardControllerError(C.INVALID_SPEC, 'Expected a non-empty array of specs.')
    specs.forEach((spec) => validateCreateSpec(spec))
    specs = structuredClone(specs)
    const objects = await this._materialize(specs)
    if (this._canvas() !== canvas) throw new BoardControllerError(C.NOT_READY, 'Board canvas changed during materialization.')
    regenerateMathBoardObjectIds(objects, { boardObjectPolicy: this._policy })
    objects.forEach((object, index) => this._prepareCreatedObject(object, specs[index]))
    const start = canvas.getObjects().length
    const entries = objects.map((object, offset) => ({ object, index: start + offset }))
    const command = batch ? { type: 'batch-add', entries } : { type: 'add', ...entries[0] }
    return this._commit(canvas, () => {
      entries.forEach(({ object, index }) => {
        canvas.insertAt(index, object)
        if (!canvas.getObjects().includes(object)) throw new Error('Object was not inserted.')
      })
      if (options.select === true) this._select(canvas, objects)
    }, () => this._rollback([
      () => { if (objects.some((object) => this._selectionContains(canvas, object))) canvas.discardActiveObject() },
      ...objects.map((object) => () => canvas.remove(object)),
    ]), command, () => objects.map((object) => this._read(object)))
  }

  async create(spec, options = {}) {
    return (await this._create([spec], options, false))[0]
  }

  async createMany(specs, options = {}) {
    return this._create(specs, options, true)
  }

  async update(id, patch, options = {}) {
    const canvas = this._canvas()
    this._assertCanMutate(canvas)
    const object = this._target(canvas, id)
    validateObjectPatch(patch, this._policy.kindOf(object))
    patch = structuredClone(patch)
    if (this._policy.isFormula(object) && 'latex' in patch && patch.latex !== object.latex) {
      return this._replaceFormula(canvas, object, patch, options)
    }
    if (this._policy.isActiveSelection(object.group)) canvas.discardActiveObject()
    const before = snapshotObject(object)
    const transformPatch = { ...patch }
    delete transformPatch.latex
    let after
    return this._commit(canvas, () => {
      object.set(transformPatch)
      object.setCoords()
      object.dirty = true
      after = snapshotObject(object)
    }, () => applySnapshot(object, before), () => snapshotsEqual(before, after) ? null : {
      type: 'modify', entries: [{ object, before, after }],
    }, () => this._read(object))
  }

  async _replaceFormula(canvas, existing, patch, options) {
    const [next] = await this._materialize([{ ...this._read(existing), ...patch }])
    if (this._canvas() !== canvas || !canvas.getObjects().includes(existing)) {
      throw new BoardControllerError(C.COMMIT_FAILED, 'Formula changed while rendering.')
    }
    const selected = this._selectionContains(canvas, existing)
    if (this._policy.isActiveSelection(existing.group)) canvas.discardActiveObject()
    // Re-read the transform after rendering: a human may have moved the retained object meanwhile.
    const current = this._read(existing)
    const transform = {}
    for (const key of [...TRANSFORM_KEYS, 'opacity']) {
      if (key in current) transform[key] = current[key]
      if (key in patch) transform[key] = patch[key]
    }
    next.set(transform)
    next.setCoords()
    ensureMathBoardObjectId(next, getMathBoardObjectId(existing))
    this._prepareCreatedObject(next, { ...current, ...patch })
    const index = canvas.getObjects().indexOf(existing)
    return this._commit(canvas, () => {
      if (selected) canvas.discardActiveObject()
      canvas.remove(existing)
      canvas.insertAt(index, next)
      if (canvas.getObjects().includes(existing) || !canvas.getObjects().includes(next)) throw new Error('Formula replacement failed.')
      if (selected || options.select === true) canvas.setActiveObject(next)
    }, () => this._rollback([
      () => { if (this._selectionContains(canvas, next)) canvas.discardActiveObject() },
      () => canvas.remove(next),
      () => { if (!canvas.getObjects().includes(existing)) canvas.insertAt(index, existing) },
      () => { if (selected) canvas.setActiveObject(existing) },
    ]), { type: 'replace', index, removed: existing, added: next }, () => this._read(next))
  }

  async delete(id) {
    const canvas = this._canvas()
    this._assertCanMutate(canvas)
    const object = this._target(canvas, id)
    const node = this._read(object)
    const index = canvas.getObjects().indexOf(object)
    return this._commit(canvas, () => {
      if (this._selectionContains(canvas, object)) canvas.discardActiveObject()
      canvas.remove(object)
      if (canvas.getObjects().includes(object)) throw new Error('Object was not removed.')
    }, () => {
      if (!canvas.getObjects().includes(object)) canvas.insertAt(index, object)
    }, { type: 'delete', entries: [{ object, index }] }, () => node)
  }

  observe() {
    return serializeBoardState({ canvas: this._canvas(), boardObjectPolicy: this._policy, boardId: this._getBoardId() || null })
  }
}
