import test from 'node:test'
import assert from 'node:assert/strict'
import { Path, Group } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import {
  FormulaObject,
  FORMULA_SELECTION_PADDING,
} from '../src/formulas/FormulaObject.js'
import { FORMULA_TYPE } from '../src/formulas/constants.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { serializeFabricObject } from '../src/stamps/serialize.js'

installFabricDomStub()

const policy = new BoardObjectPolicy()

function path(opts) {
  return new Path('M 0 0 L 10 0', opts)
}

test('FormulaObject defaults selection padding without changing child geometry', () => {
  const child = path({ fill: 'black' })
  const formula = new FormulaObject([child], { latex: 'x' })
  assert.equal(formula.padding, FORMULA_SELECTION_PADDING)
})

test('FormulaObject carries semantic metadata and is not a Board Group', () => {
  const formula = new FormulaObject([path({ fill: 'black', stroke: null })], {
    latex: 'x^2',
    left: 12,
    top: 34,
  })

  assert.equal(formula.latex, 'x^2')
  assert.equal(formula.formulaType, FORMULA_TYPE)
  assert.equal(formula.mathboardInkMode, 'auto')
  assert.equal(policy.isFormula(formula), true)
  assert.equal(policy.isBoardGroup(formula), false)
  assert.equal(policy.kindOf(formula), 'formula')
})

test('applyInk recolors fill-only and leaves stroke null', () => {
  const formula = new FormulaObject([
    path({ fill: 'black', stroke: null }),
  ], { latex: 'x' })

  assert.equal(formula.applyInk('#f00'), true)
  const child = formula.getObjects()[0]
  assert.equal(child.fill, '#f00')
  assert.equal(child.stroke, null)
})

test('applyInk recolors stroke-only and leaves fill untouched', () => {
  const formula = new FormulaObject([
    path({ fill: null, stroke: 'black' }),
  ], { latex: 'x' })

  formula.applyInk('#0f0')
  const child = formula.getObjects()[0]
  assert.equal(child.fill, null)
  assert.equal(child.stroke, '#0f0')
})

test('applyInk skips transparent and empty paint', () => {
  const formula = new FormulaObject([
    path({ fill: 'transparent', stroke: 'none' }),
    path({ fill: null, stroke: null }),
  ], { latex: 'x' })

  assert.equal(formula.applyInk('#00f'), false)
  const [a, b] = formula.getObjects()
  assert.equal(a.fill, 'transparent')
  assert.equal(a.stroke, 'none')
  assert.equal(b.fill, null)
  assert.equal(b.stroke, null)
})

test('applyInk recurses into nested groups', () => {
  const nested = new Group([path({ fill: 'black', stroke: null })])
  const formula = new FormulaObject([nested], { latex: 'x' })

  formula.applyInk('#abc')
  assert.equal(nested.getObjects()[0].fill, '#abc')
})

test('stamp serializer keeps FormulaObject as semantic formula node', () => {
  const formula = new FormulaObject([path({ fill: 'black' })], {
    latex: 'a+b',
    left: 5,
    top: 6,
  })
  const node = serializeFabricObject(formula)
  assert.equal(node.type, 'formula')
  assert.equal(node.latex, 'a+b')
  assert.equal(node.objects, undefined)
})

test('FormulaObject clone preserves atomic formula semantics', async () => {
  const formula = new FormulaObject([
    path({ fill: 'black', stroke: null }),
  ], {
    latex: '\\frac{a}{b}',
    mathboardInkMode: 'auto',
    left: 40,
    top: 50,
  })

  const clone = await formula.clone()
  assert.ok(clone instanceof FormulaObject)
  assert.equal(clone.latex, formula.latex)
  assert.equal(clone.formulaType, FORMULA_TYPE)
  assert.equal(clone.mathboardInkMode, 'auto')
  assert.equal(clone.getObjects().length, formula.getObjects().length)
  assert.notEqual(clone.getObjects()[0], formula.getObjects()[0])
  assert.equal(clone.getObjects()[0].fill, 'black')
  assert.equal(clone.padding, formula.padding)
})
