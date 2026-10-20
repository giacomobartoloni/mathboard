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

import { ActiveSelection, Group } from 'fabric'
import { validateLayoutOptions, sceneSafeArea, planLayout, unionBounds } from './layout/planLayout.js'
import { getMathBoardObjectId, ensureMathBoardObjectId, regenerateMathBoardObjectIds } from './ids.js'
import { materializeBoardObjects } from './objects/materialize.js'
import { normalizeCreateOrigins } from './objects/normalizeCreateOrigins.js'
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
    afterMutation = () => {}, prepareUpdatedObject = () => {}, getBoardId = () => null, isMutationStable,
    getLayoutSafeArea = (canvas) => ({ left: 0, top: 0, width: canvas.getWidth(), height: canvas.getHeight() }) }) {
    if (typeof isMutationStable !== 'function') throw new TypeError('isMutationStable must be a function.')
    this._getCanvas = getCanvas
    this._policy = boardObjectPolicy
    this._buildFormula = buildFormula
    this._pushHistoryCommand = pushHistoryCommand
    this._runWithoutHistory = runWithoutHistory
    this._prepareCreatedObject = prepareCreatedObject
    this._afterMutation = afterMutation
    this._prepareUpdatedObject = prepareUpdatedObject
    this._getBoardId = getBoardId
    this._isMutationStable = isMutationStable
    this._getLayoutSafeArea = getLayoutSafeArea
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

  _isStable() {
    return Boolean(this._isMutationStable())
  }

  _assertCanMutate() {
    if (!this._isStable()) {
      throw new BoardControllerError(C.COMMIT_FAILED, 'Finish the current board gesture before a programmable mutation.')
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
    this._assertCanMutate()
    const previous = canvas.renderOnAddRemove
    canvas.renderOnAddRemove = false
    let result
    try {
      this._runWithoutHistory(change)
      result = readResult()
      const entry = typeof command === 'function' ? command() : command
      if (entry) this._pushHistoryCommand(entry)
    } catch (cause) {
      try {
        this._runWithoutHistory(rollback)
      } catch (rollbackError) {
        console.error('Board rollback failed.', rollbackError)
      }
      throw new BoardControllerError(C.COMMIT_FAILED, 'Board mutation could not be committed.', { cause })
    } finally {
      canvas.renderOnAddRemove = previous
      canvas.requestRenderAll()
    }
    try { this._afterMutation() } catch (error) {
      console.error('Board mutation committed, but post-commit refresh failed.', error)
    }
    return result
  }

  async _create(specs, options, batch) {
    const canvas = this._canvas()
    this._assertCanMutate()
    if (!Array.isArray(specs) || !specs.length) throw new BoardControllerError(C.INVALID_SPEC, 'Expected a non-empty array of specs.')
    specs.forEach((spec) => validateCreateSpec(spec))
    try { specs = structuredClone(specs) } catch (cause) {
      throw new BoardControllerError(C.INVALID_SPEC, 'Cannot clone object spec.', { cause })
    }
    specs = specs.map(normalizeCreateOrigins)
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
    this._assertCanMutate()
    const object = this._target(canvas, id)
    validateObjectPatch(patch, this._policy.kindOf(object))
    patch = structuredClone(patch)
    const hasPaint = 'fill' in patch || 'stroke' in patch
    if (hasPaint && !('mathboardInkMode' in patch)) patch.mathboardInkMode = 'fixed'
    if (this._policy.isFormula(object)) {
      // Canonicalize the patch before merging with the retained semantic node:
      // a new stroke must replace an older fill, rather than lose precedence.
      if (hasPaint) {
        patch.fill = 'fill' in patch ? patch.fill : patch.stroke
        delete patch.stroke
      }
      if ('latex' in patch || hasPaint || 'mathboardInkMode' in patch) {
        const current = this._read(object)
        if (Object.keys(patch).every((key) => patch[key] === current[key])) return current
        return this._replaceFormula(canvas, object, patch, options)
      }
    }
    if (this._policy.isActiveSelection(object.group)) canvas.discardActiveObject()
    const before = snapshotObject(object)
    const transformPatch = { ...patch }
    delete transformPatch.latex
    let after
    return this._commit(canvas, () => {
      object.set(transformPatch)
      this._prepareUpdatedObject(object)
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
    this._assertCanMutate()
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
    if (snapshotsEqual(current, this._read(next))) return current
    const selected = this._selectionContains(canvas, existing)
    if (this._policy.isActiveSelection(existing.group)) canvas.discardActiveObject()
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

  async group(ids, options = {}) {
    const canvas = this._canvas()
    this._assertCanMutate()
    if (!Array.isArray(ids) || ids.length < 2
      || Array.from(ids).some((id) => typeof id !== 'string' || !id.trim())
      || new Set(ids).size !== ids.length) {
      throw new BoardControllerError(C.INVALID_SPEC, 'Expected at least two unique non-empty object IDs.')
    }
    const targets = new Set(ids.map((id) => this._target(canvas, id)))
    if ([...targets].some((object) => !this._policy.capabilitiesOf(object).group)) {
      throw new BoardControllerError(C.INVALID_SPEC, 'Objects must be groupable top-level objects; nested grouping is not supported.')
    }
    const members = canvas.getObjects().flatMap((object, index) => targets.has(object) ? [{ object, index }] : [])
    const snapshots = members.map(({ object }) => ({ object, snapshot: snapshotObject(object) }))
    const active = canvas.getActiveObject()
    const selected = canvas.getActiveObjects()
    const discardSelection = options.select === true || selected.some((object) => targets.has(object))
    const isSelection = discardSelection && this._policy.isActiveSelection(active)
    const selectionSnapshot = isSelection ? snapshotObject(active) : null
    const localSnapshots = isSelection ? selected.map((object) => ({ object,
      snapshot: Object.fromEntries(Object.keys(snapshotObject(object)).map((key) => [key, object[key]])),
    })) : []
    let group
    const index = canvas.getObjects().length - members.length
    return this._commit(canvas, () => {
      if (discardSelection) canvas.discardActiveObject()
      // Keep a reference before adopting children so even a partial layout failure can roll back.
      group = new Group([], { originX: 'left', originY: 'top', subTargetCheck: false, interactive: false })
      ensureMathBoardObjectId(group)
      for (const { object } of members) {
        canvas.remove(object)
        if (canvas.getObjects().includes(object)) throw new Error('Group member was not removed.')
      }
      group.add(...members.map(({ object }) => object))
      canvas.insertAt(index, group)
      if (!canvas.getObjects().includes(group)) throw new Error('Group was not inserted.')
      if (options.select === true) canvas.setActiveObject(group)
    }, () => this._rollback([
      () => { if (group && this._selectionContains(canvas, group)) canvas.discardActiveObject() },
      () => { if (group) group.removeAll() },
      () => { if (group) canvas.remove(group) },
      ...snapshots.map(({ object, snapshot }) => () => applySnapshot(object, snapshot)),
      ...members.map(({ object, index: originalIndex }) => () => {
        if (!canvas.getObjects().includes(object)) canvas.insertAt(originalIndex, object)
      }),
      () => {
        if (!discardSelection) return
        if (isSelection) {
          active.removeAll()
          active.add(...selected)
          applySnapshot(active, selectionSnapshot)
          localSnapshots.forEach(({ object, snapshot }) => applySnapshot(object, snapshot))
        }
        if (active) canvas.setActiveObject(active)
      },
    ]), () => ({ type: 'group', group, index, members }), () => this._read(group))
  }

  async delete(id) {
    const canvas = this._canvas()
    this._assertCanMutate()
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

  async deleteMany(ids) {
    const canvas = this._canvas()
    this._assertCanMutate()
    if (!Array.isArray(ids) || Array.from(ids).some((id) => typeof id !== 'string' || !id.trim())
      || new Set(ids).size !== ids.length) {
      throw new BoardControllerError(C.INVALID_SPEC, 'Expected an array of unique non-empty object IDs.')
    }
    // Resolve the complete request before reading or changing selection geometry.
    const targets = new Set(ids.map((id) => this._target(canvas, id)))
    return this._deleteRoots(canvas, targets)
  }

  async clear() {
    const canvas = this._canvas()
    this._assertCanMutate()
    return this._deleteRoots(canvas, new Set(canvas.getObjects()))
  }

  _deleteRoots(canvas, targets) {
    const entries = canvas.getObjects().flatMap((object, index) => targets.has(object) ? [{ object, index }] : [])
    if (!entries.length) return []
    const nodes = entries.map(({ object }) => this._read(object))
    const active = canvas.getActiveObject()
    const selected = canvas.getActiveObjects()
    const discardSelection = selected.some((object) => targets.has(object))
    const isSelection = discardSelection && this._policy.isActiveSelection(active)
    const selectionSnapshot = isSelection ? snapshotObject(active) : null
    // Preserve the original selection plane exactly, including unremoved members.
    const localSnapshots = isSelection ? selected.map((object) => ({ object,
      snapshot: Object.fromEntries(Object.keys(snapshotObject(object)).map((key) => [key, object[key]])),
    })) : []
    return this._commit(canvas, () => {
      if (discardSelection) canvas.discardActiveObject()
      for (const { object } of entries) {
        canvas.remove(object)
        if (canvas.getObjects().includes(object)) throw new Error('Object was not removed.')
      }
    }, () => this._rollback([
      ...entries.map(({ object, index }) => () => {
        if (!canvas.getObjects().includes(object)) canvas.insertAt(index, object)
      }),
      () => {
        if (!discardSelection) return
        if (isSelection) {
          // discardActiveObject removes members from the retained ActiveSelection.
          // Reuse that instance, then restore both its plane and its local members.
          active.removeAll()
          active.add(...selected)
          applySnapshot(active, selectionSnapshot)
          localSnapshots.forEach(({ object, snapshot }) => applySnapshot(object, snapshot))
        }
        canvas.setActiveObject(active)
      },
    ]), { type: 'delete', entries }, () => nodes)
  }

  measure(id) {
    const canvas = this._canvas()
    const object = this._target(canvas, id)
    // ActiveSelection can inflate a child's conservative skew box differently
    // from the same committed scene transform. Measure that transform directly,
    // restoring every runtime field before returning (as semantic serialization does).
    let bounds
    if (this._policy.isActiveSelection(object.group)) {
      const group = object.group, groupDirty = group.dirty, dirty = object.dirty
      const local = Object.fromEntries(TRANSFORM_KEYS.map(key => [key, object[key]]))
      const absolute = snapshotObject(object)
      try {
        object.group = undefined
        object.set(Object.fromEntries(TRANSFORM_KEYS.map(key => [key, absolute[key]])))
        object.setCoords()
        bounds = object.getBoundingRect()
      } finally {
        object.group = group
        object.set(local); object.setCoords()
        object.dirty = dirty; group.dirty = groupDirty
      }
    } else bounds = object.getBoundingRect()
    if (!['left', 'top', 'width', 'height'].every(key => Number.isFinite(bounds[key]))) {
      throw new BoardControllerError(C.INVALID_SPEC, 'Cannot measure nonfinite geometry.')
    }
    return { id, ...structuredClone(bounds) }
  }

  async layout(options) {
    const canvas = this._canvas()
    this._assertCanMutate()
    validateLayoutOptions(options)
    const ids = options.ids.slice()
    const objects = ids.map(id => this._target(canvas, id))
    const bounds = ids.map(id => this.measure(id))
    const safeArea = sceneSafeArea(canvas, this._getLayoutSafeArea(canvas), options.margin ?? 16)
    const placements = planLayout(bounds, options, safeArea)
    const entries = objects.map((object, index) => {
      const before = snapshotObject(object)
      const rawX = placements[index].left - bounds[index].left, rawY = placements[index].top - bounds[index].top
      // Rendered transforms can introduce subpixel arithmetic residue on repeat.
      const dx = Math.abs(rawX) < 1e-7 ? 0 : rawX, dy = Math.abs(rawY) < 1e-7 ? 0 : rawY
      return { object, before, after: { ...before, left: before.left + dx, top: before.top + dy } }
    }).filter(entry => !snapshotsEqual(entry.before, entry.after))
    const result = () => {
      const scene = this.observe()
      const nodes = ids.map(id => scene.objects.find(object => object.id === id))
      return { objects: nodes, bounds: unionBounds(nodes.map(node => node.bounds)), safeArea }
    }
    if (!entries.length) return result()
    const active = canvas.getActiveObject(), selected = canvas.getActiveObjects()
    const discard = entries.some(e => selected.includes(e.object))
    const selection = discard && this._policy.isActiveSelection(active)
    const selectionSnapshot = selection ? snapshotObject(active) : null
    const local = selection ? selected.map(object => ({ object,
      snapshot: Object.fromEntries(Object.keys(snapshotObject(object)).map(key => [key, object[key]])),
    })) : []
    return this._commit(canvas, () => {
      if (discard) canvas.discardActiveObject()
      entries.forEach(({object, after}) => applySnapshot(object, after))
    }, () => this._rollback([
      ...entries.map(({object, before}) => () => applySnapshot(object, before)),
      () => {
        if (!discard) return
        if (selection) {
          active.removeAll(); active.add(...selected)
          applySnapshot(active, selectionSnapshot)
          local.forEach(({object, snapshot}) => applySnapshot(object, snapshot))
        }
        canvas.setActiveObject(active)
      },
    ]), { type: 'modify', entries }, result)
  }

  observe() {
    const canvas = this._canvas()
    return { ...serializeBoardState({ canvas, boardObjectPolicy: this._policy, boardId: this._getBoardId() || null }),
      stable: this._isStable() }
  }
}
