import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BOARD_OBJECT_KINDS,
  BoardObjectPolicy,
} from '../src/board/BoardObjectPolicy.js'
import {
  FORMULA_CAPABILITIES,
  GROUP_CAPABILITIES,
} from '../src/board/capabilities.js'
import { FORMULA_TYPE } from '../src/formulas/constants.js'
import { flattenInkTargets } from '../src/config/colors.js'
import { serializeFabricObject } from '../src/stamps/serialize.js'

const policy = new BoardObjectPolicy()

function objectOf(type, extra = {}) {
  return {
    type,
    isType: (...types) => types.includes(type),
    ...extra,
  }
}

test('formulaType marks a Formula regardless of Fabric type', () => {
  const image = objectOf('image', { formulaType: FORMULA_TYPE, latex: 'x' })
  assert.equal(policy.isFormula(image), true)
  assert.equal(policy.kindOf(image), BOARD_OBJECT_KINDS.FORMULA)
  assert.deepEqual(policy.capabilitiesOf(image), FORMULA_CAPABILITIES)
})

test('objectKind formula requires latex', () => {
  assert.equal(
    policy.isFormula(objectOf('image', { objectKind: 'formula' })),
    false,
  )
  assert.equal(
    policy.isFormula(objectOf('image', { objectKind: 'formula', latex: 'y' })),
    true,
  )
})

test('Formula-like Group is Formula, not Board Group', () => {
  const formulaGroup = objectOf('Group', {
    formulaType: FORMULA_TYPE,
    latex: 'x',
    getObjects: () => [objectOf('Path')],
  })

  assert.equal(policy.isFormula(formulaGroup), true)
  assert.equal(policy.isBoardGroup(formulaGroup), false)
  assert.equal(policy.kindOf(formulaGroup), BOARD_OBJECT_KINDS.FORMULA)
  assert.notDeepEqual(policy.capabilitiesOf(formulaGroup), GROUP_CAPABILITIES)
  assert.deepEqual(policy.capabilitiesOf(formulaGroup), FORMULA_CAPABILITIES)
})

test('permanent Group without formula markers is Board Group', () => {
  const group = objectOf('Group', {
    getObjects: () => [objectOf('Rect')],
  })
  assert.equal(policy.isBoardGroup(group), true)
  assert.equal(policy.kindOf(group), BOARD_OBJECT_KINDS.GROUP)
  assert.deepEqual(policy.capabilitiesOf(group), GROUP_CAPABILITIES)
})

test('kindOf order: ActiveSelection, Formula, Group', () => {
  const multi = objectOf('ActiveSelection', {
    getObjects: () => [],
  })
  assert.equal(policy.kindOf(multi), BOARD_OBJECT_KINDS.ACTIVE_SELECTION)

  const formulaOnGroup = objectOf('Group', {
    formulaType: FORMULA_TYPE,
    latex: 'a',
  })
  assert.equal(policy.kindOf(formulaOnGroup), BOARD_OBJECT_KINDS.FORMULA)
})

test('flattenInkTargets treats Formula Group as a semantic leaf', () => {
  const childPath = objectOf('Path', { stroke: '#000000', mathboardInkMode: 'auto' })
  const formulaGroup = objectOf('Group', {
    formulaType: FORMULA_TYPE,
    latex: 'x',
    getObjects: () => [childPath],
  })

  assert.deepEqual(flattenInkTargets([formulaGroup]), [formulaGroup])
})

test('stamp serializer serializes Formula Group as type formula', () => {
  const formulaGroup = objectOf('Group', {
    formulaType: FORMULA_TYPE,
    latex: 'x',
    left: 10,
    top: 20,
    getObjects: () => [objectOf('Path')],
  })

  const node = serializeFabricObject(formulaGroup)
  assert.equal(node.type, 'formula')
  assert.equal(node.latex, 'x')
  assert.equal(node.objects, undefined)
})
