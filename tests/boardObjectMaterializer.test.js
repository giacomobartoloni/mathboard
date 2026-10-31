import test from 'node:test'
import assert from 'node:assert/strict'
import { Path, Rect, IText, Textbox, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { materializeBoardObject, materializeBoardObjects } from '../src/board/objects/materialize.js'
import { readSemanticBoardObject } from '../src/board/objects/serialize.js'

installFabricDomStub()

test('materializeBoardObject restores path null fill and optional id', async () => {
  const object = await materializeBoardObject(
    {
      id: 'mbobj_path1',
      type: 'path',
      path: [['M', 0, 0], ['L', 5, 5]],
      fill: null,
      stroke: '#111111',
      strokeWidth: 2,
    },
    { buildFormula: async () => null, restoreIds: true },
  )
  assert.ok(object instanceof Path)
  assert.equal(object.fill, null)
  assert.equal(object.mathboardId, 'mbobj_path1')
})

test('sparse text props do not pass undefined into Fabric', async () => {
  const object = await materializeBoardObject(
    {
      type: 'text',
      text: 'hello',
      left: 3,
      top: 4,
    },
    { buildFormula: async () => null, restoreIds: false },
  )
  assert.ok(object instanceof IText)
  assert.equal(object.text, 'hello')
  assert.equal(object.mathboardId, undefined)
})

test('group materializes children and restores ids', async () => {
  const [group] = await materializeBoardObjects(
    [{
      id: 'mbobj_g',
      type: 'group',
      left: 10,
      top: 20,
      objects: [
        { id: 'mbobj_r', type: 'rect', width: 8, height: 4, left: 0, top: 0 },
      ],
    }],
    { buildFormula: async () => null, restoreIds: true },
  )
  assert.ok(group instanceof Group)
  assert.equal(group.mathboardId, 'mbobj_g')
  assert.ok(group.getObjects()[0] instanceof Rect)
  assert.equal(group.getObjects()[0].mathboardId, 'mbobj_r')
})

test('formula failure rejects', async () => {
  await assert.rejects(
    () => materializeBoardObject(
      { type: 'formula', latex: 'x', id: 'mbobj_f' },
      { buildFormula: async () => null, restoreIds: true },
    ),
    /Formula render failed/,
  )
})

test('a later formula failure disposes objects materialized earlier in the batch', async () => {
  const first = await materializeBoardObject({ type: 'rect', width: 10, height: 10 },
    { buildFormula: async () => null })
  let disposed = false
  const originalDispose = Rect.prototype.dispose
  Rect.prototype.dispose = function (...args) {
    disposed = true
    return originalDispose.apply(this, args)
  }
  try {
    await assert.rejects(() => materializeBoardObjects([
      { type: 'rect', width: 10, height: 10 },
      { type: 'formula', latex: 'x' },
    ], { buildFormula: async () => null }), /Formula render failed/)
    assert.equal(disposed, true)
  } finally {
    Rect.prototype.dispose = originalDispose
    first.dispose()
  }
})

test('text without width remains editable IText with the UI font; explicit width wraps', async () => {
  const opts = { buildFormula: async () => null }
  const plain = await materializeBoardObject({ type: 'text', text: 'Hello' }, opts)
  const wrapped = await materializeBoardObject({
    type: 'text', text: 'one two three four five six seven', width: 100, fontSize: 20,
  }, opts)
  assert.ok(plain instanceof IText)
  assert.equal(plain instanceof Textbox, false)
  assert.equal(plain.fontFamily, 'Arial')
  assert.ok(wrapped instanceof Textbox)
  assert.equal(wrapped.fontFamily, 'Arial')
  assert.equal(wrapped.width, 100)
  // The headless Fabric stub does not provide browser font metrics for line wrapping.
  assert.equal(readSemanticBoardObject(wrapped).width, 100)
  plain.dispose()
  wrapped.dispose()
})
