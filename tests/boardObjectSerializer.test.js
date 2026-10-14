import test from 'node:test'
import assert from 'node:assert/strict'
import { Rect, Path, IText, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { readSemanticBoardObject, toStampNode } from '../src/board/objects/serialize.js'
import { ensureMathBoardObjectId } from '../src/board/ids.js'

installFabricDomStub()

const policy = new BoardObjectPolicy()

test('readSemanticBoardObject keeps null path fill and assigns id', () => {
  const path = new Path([['M', 0, 0], ['L', 10, 10]], {
    fill: null,
    stroke: '#000000',
    strokeWidth: 2,
  })
  const semantic = readSemanticBoardObject(path, { boardObjectPolicy: policy })
  assert.equal(semantic.type, 'path')
  assert.equal(semantic.fill, null)
  assert.match(semantic.id, /^mbobj_/)
})

test('toStampNode strips identity', () => {
  const rect = new Rect({ width: 20, height: 10, left: 1, top: 2 })
  ensureMathBoardObjectId(rect)
  const semantic = readSemanticBoardObject(rect, { boardObjectPolicy: policy })
  const stamp = toStampNode(semantic)
  assert.equal(stamp.id, undefined)
  assert.equal(stamp.type, 'rect')
  assert.equal(stamp.width, 20)
})

test('group serializes children recursively with ids', () => {
  const text = new IText('hi', { left: 0, top: 0 })
  const group = new Group([text], { left: 5, top: 6, subTargetCheck: false, interactive: false })
  const semantic = readSemanticBoardObject(group, { boardObjectPolicy: policy })
  assert.equal(semantic.type, 'group')
  assert.match(semantic.id, /^mbobj_/)
  assert.equal(semantic.objects[0].type, 'text')
  assert.match(semantic.objects[0].id, /^mbobj_/)
})

test('ActiveSelection is rejected', () => {
  assert.throws(
    () => readSemanticBoardObject({ isType: (t) => t === 'ActiveSelection' }),
    /ActiveSelection/,
  )
})
