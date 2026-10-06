import test from 'node:test'
import assert from 'node:assert/strict'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { FORMULA_TYPE } from '../src/formulas/constants.js'
import { resolveStampRoot } from '../src/stamps/resolveStampRoot.js'

const policy = new BoardObjectPolicy()

function objectOf(type, extra = {}) {
  return {
    type,
    isType: (...types) => types.includes(type),
    ...extra,
  }
}

test('single Board Group is reused as Stamp root', () => {
  const group = objectOf('Group', { getObjects: () => [] })
  const wrapCalls = []
  const root = resolveStampRoot([group], {
    isBoardGroup: (object) => policy.isBoardGroup(object),
    wrap: (objects) => {
      wrapCalls.push(objects)
      return { type: 'wrapper', objects }
    },
  })

  assert.equal(root, group)
  assert.equal(wrapCalls.length, 0)
})

test('single Formula-like Group is wrapped, not reused as Stamp root', () => {
  const formulaGroup = objectOf('Group', {
    formulaType: FORMULA_TYPE,
    latex: 'x',
    getObjects: () => [],
  })
  assert.equal(policy.isBoardGroup(formulaGroup), false)

  const wrapCalls = []
  const root = resolveStampRoot([formulaGroup], {
    isBoardGroup: (object) => policy.isBoardGroup(object),
    wrap: (objects) => {
      wrapCalls.push(objects)
      return { type: 'wrapper', objects }
    },
  })

  assert.notEqual(root, formulaGroup)
  assert.equal(root.type, 'wrapper')
  assert.deepEqual(wrapCalls, [[formulaGroup]])
  assert.equal(root.objects[0], formulaGroup)
})

test('single non-group object is wrapped', () => {
  const rect = objectOf('Rect')
  const root = resolveStampRoot([rect], {
    isBoardGroup: (object) => policy.isBoardGroup(object),
    wrap: (objects) => ({ type: 'wrapper', objects }),
  })

  assert.equal(root.type, 'wrapper')
  assert.equal(root.objects[0], rect)
})
