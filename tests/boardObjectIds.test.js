import test from 'node:test'
import assert from 'node:assert/strict'
import { Rect, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import {
  createMathBoardObjectId,
  ensureMathBoardObjectId,
  getMathBoardObjectId,
  regenerateMathBoardObjectIds,
} from '../src/board/ids.js'

installFabricDomStub()

test('createMathBoardObjectId uses mbobj_ prefix and uniqueness', () => {
  const a = createMathBoardObjectId()
  const b = createMathBoardObjectId()
  assert.match(a, /^mbobj_/)
  assert.notEqual(a, b)
})

test('ensureMathBoardObjectId preserves existing and preferred', () => {
  const object = new Rect({ width: 10, height: 10 })
  const first = ensureMathBoardObjectId(object)
  assert.equal(ensureMathBoardObjectId(object), first)
  assert.equal(getMathBoardObjectId(object), first)

  const preferred = 'mbobj_preferred'
  assert.equal(ensureMathBoardObjectId(object, preferred), preferred)
  assert.equal(object.mathboardId, preferred)
})

test('two objects get different IDs', () => {
  const a = new Rect({ width: 1, height: 1 })
  const b = new Rect({ width: 1, height: 1 })
  ensureMathBoardObjectId(a)
  ensureMathBoardObjectId(b)
  assert.notEqual(a.mathboardId, b.mathboardId)
})

test('formula replacement style: preferred ID restored on new instance', () => {
  const existing = new Rect({ width: 1, height: 1 })
  const id = ensureMathBoardObjectId(existing)
  const next = new Rect({ width: 2, height: 2 })
  ensureMathBoardObjectId(next, id)
  assert.equal(next.mathboardId, id)
})

test('regenerateMathBoardObjectIds refreshes group and children', () => {
  const child = new Rect({ width: 5, height: 5 })
  const childId = ensureMathBoardObjectId(child)
  const group = new Group([child], { subTargetCheck: false, interactive: false })
  const groupId = ensureMathBoardObjectId(group)

  regenerateMathBoardObjectIds(group)
  assert.notEqual(group.mathboardId, groupId)
  assert.notEqual(group.getObjects()[0].mathboardId, childId)
})

test('ungroup semantics: child IDs preserved when only group is regenerated', () => {
  const child = new Rect({ width: 5, height: 5 })
  const childId = ensureMathBoardObjectId(child)
  const group = new Group([child], { subTargetCheck: false, interactive: false })
  ensureMathBoardObjectId(group)
  // Ungroup keeps children as-is.
  assert.equal(getMathBoardObjectId(child), childId)
})
