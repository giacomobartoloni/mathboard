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
import { Group, Rect } from 'fabric'
import { installFabricDomStub } from './helpers/fabric-dom-stub.js'
import { makeControllerCanvas } from './helpers/controller-canvas.js'
import { BoardObjectPolicy } from '../src/board/BoardObjectPolicy.js'
import { BoardController } from '../src/board/BoardController.js'
import { buildPlotObject } from '../src/plots/buildPlotObject.js'
import { serializeBoardDocument } from '../src/board/persistence/serializeBoardDocument.js'
import { materializeBoardDocument } from '../src/board/persistence/materializeBoardDocument.js'
import { validateBoardDocument } from '../src/board/persistence/schema.js'
import { migrateBoardDocument } from '../src/board/persistence/migrateBoardDocument.js'
import {
  STAMP_PLOT_VERSION,
  STAMP_VERSION,
  encodeObjectsAsStamp,
  decodeStampString,
  stampDocumentFromObjects,
  materializeStampDocument,
  validateStampDocument
} from '../src/stamps/index.js'
installFabricDomStub()
const spec = {
  type: 'plot',
  syntax: 'latex-v1',
  latex: 'x^2-5x+6',
  mathWindow: { xMin: -6, xMax: 6, yMin: -4, yMax: 4 },
  frame: { width: 480, height: 320 },
  axes: true,
  grid: true
}
const policy = new BoardObjectPolicy()
const buildFormula = async () => {
  throw Error('Unexpected formula')
}
function setup(extra = {}) {
  const canvas = makeControllerCanvas(),
    history = []
  return {
    canvas,
    history,
    controller: new BoardController({
      getCanvas: () => canvas,
      boardObjectPolicy: policy,
      buildFormula,
      pushHistoryCommand: (c) => history.push(c),
      isMutationStable: () => true,
      ...extra
    })
  }
}

test('old documents stay v1, recursive plots use v2, plot in v1 and future versions fail', async () => {
  const { canvas } = setup()
  let doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(doc.version, 1)
  assert.equal(migrateBoardDocument(doc), doc)
  canvas.insertAt(0, new Group([await buildPlotObject(spec)]))
  doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(doc.version, 2)
  assert.equal(doc.objects[0].objects[0].type, 'plot')
  assert.equal(migrateBoardDocument(doc), doc)
  assert.throws(() => validateBoardDocument({ ...doc, version: 1 }), {
    code: 'board_document_unsupported_version'
  })
  assert.throws(() => validateBoardDocument({ ...doc, version: 99 }), {
    code: 'board_document_unsupported_version'
  })
  const restored = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(policy.kindOf(restored.objects[0].getObjects()[0]), 'plot')
  assert.equal(restored.objects[0].getObjects()[0].plotSpec.latex, spec.latex)
  assert.deepEqual(
    serializeBoardDocument({
      canvas: { getObjects: () => restored.objects },
      boardObjectPolicy: policy
    }),
    doc
  )
})
test('plot edit preserves identity and transform and records a single replace command', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(
    { ...spec, left: 100, top: 150, angle: 30, scaleX: 1.5 },
    { select: true }
  )
  const old = canvas.getObjects()[0]
  const after = await controller.update(
    before.id,
    { latex: 'x^2', mathWindow: { xMin: -3, xMax: 3, yMin: -1, yMax: 9 } },
    { select: true }
  )
  assert.equal(after.id, before.id)
  assert.equal(after.left, 100)
  assert.equal(after.angle, 30)
  assert.equal(after.scaleX, 1.5)
  assert.equal(history.length, 2)
  assert.equal(history[1].type, 'replace')
  assert.equal(history[1].removed, old)
  assert.equal(history[1].added, canvas.getObjects()[0])
  assert.equal(after.latex, 'x^2')
  // The existing replace command retains both full semantic objects for replay.
  canvas.remove(history[1].added)
  canvas.insertAt(0, history[1].removed)
  assert.equal(controller.get(before.id).latex, spec.latex)
  canvas.remove(history[1].removed)
  canvas.insertAt(0, history[1].added)
  assert.equal(controller.get(before.id).latex, 'x^2')
})
test('invalid or failed edits preserve prior object, selection and history', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(spec, { select: true }),
    old = canvas.getObjects()[0]
  for (const patch of [
    { latex: 'x+y' },
    { mathWindow: { xMin: 2, xMax: 1, yMin: 0, yMax: 1 } },
    { grid: 'yes' }
  ])
    await assert.rejects(controller.update(before.id, patch))
  assert.equal(canvas.getObjects()[0], old)
  assert.equal(canvas.getActiveObject(), old)
  assert.equal(history.length, 1)
})
test('Stamp keeps v1 for ordinary objects and emits v2 for nested semantic plots', async () => {
  const rect = new Rect({ width: 32, height: 24, fill: '#123456' })
  const ordinary = stampDocumentFromObjects([rect])
  assert.equal(ordinary.version, STAMP_VERSION)

  const plot = await buildPlotObject({
    ...spec,
    border: false,
    axisNumbers: false,
    transparentBackground: true,
    color: '#2563eb'
  })
  assert.equal(stampDocumentFromObjects([plot]).version, STAMP_PLOT_VERSION)
  const group = new Group([plot, rect], { left: 80, top: 120 })
  const document = stampDocumentFromObjects([group])
  assert.equal(document.version, STAMP_PLOT_VERSION)
  const plotNode = document.objects[0].objects.find((node) => node.type === 'plot')
  assert.ok(plotNode)
  assert.equal(plotNode.id, undefined)
  assert.equal(plotNode.latex, spec.latex)
  assert.deepEqual(plotNode.mathWindow, spec.mathWindow)
  assert.equal(plotNode.transparentBackground, true)
  assert.equal(plotNode.border, false)

  const decoded = decodeStampString(encodeObjectsAsStamp([group]))
  assert.deepEqual(decoded, document)
  const [restoredGroup] = await materializeStampDocument(decoded, { buildFormula })
  const restoredPlot = restoredGroup.getObjects().find((object) => policy.isPlot(object))
  assert.ok(restoredPlot)
  assert.equal(restoredPlot.plotSpec.latex, spec.latex)
  assert.deepEqual(restoredPlot.plotSpec.mathWindow, spec.mathWindow)
  assert.equal(restoredPlot.plotSpec.transparentBackground, true)
  assert.equal(restoredPlot.plotSpec.axisNumbers, false)
  assert.equal(restoredPlot.plotSpec.color, '#2563eb')
  assert.equal(stampDocumentFromObjects([restoredGroup]).version, STAMP_PLOT_VERSION)
})

test('Stamp v2 validates plots, rejects plots in v1 and rejects future versions', async () => {
  const plot = await buildPlotObject(spec)
  const nested = stampDocumentFromObjects([new Group([plot])])
  assert.equal(nested.version, STAMP_PLOT_VERSION)
  assert.throws(() => validateStampDocument({ ...nested, version: STAMP_VERSION }), {
    code: 'stamp_unsupported_version'
  })
  assert.throws(() => validateStampDocument({ ...nested, version: 99 }), {
    code: 'stamp_unsupported_version'
  })
  const invalid = structuredClone(nested)
  invalid.objects[0].objects[0].mathWindow.xMax = invalid.objects[0].objects[0].mathWindow.xMin
  assert.throws(() => validateStampDocument(invalid), { code: 'stamp_invalid_shape' })
})

test('moving the retained plot during async rendering preserves its latest transform', async () => {
  const { controller, canvas } = setup()
  const before = await controller.create(spec)
  const original = controller._materialize.bind(controller)
  let release
  controller._materialize = async (specs) => {
    const rendered = await original(specs)
    await new Promise((resolve) => {
      release = resolve
    })
    return rendered
  }
  const pending = controller.update(before.id, { latex: 'x^2' })
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0))
  canvas.getObjects()[0].set({ left: 321, top: 234, angle: 40 })
  release()
  const result = await pending
  assert.equal(result.left, 321)
  assert.equal(result.top, 234)
  assert.equal(result.angle, 40)
})

test('board changes during plot rendering never commit into the new scene', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(spec),
    old = canvas.getObjects()[0]
  const original = controller._materialize.bind(controller)
  let release
  controller._materialize = async (specs) => {
    const rendered = await original(specs)
    await new Promise((resolve) => {
      release = resolve
    })
    return rendered
  }
  const pending = controller.update(before.id, { latex: 'x^2' })
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0))
  controller._getCanvas = () => makeControllerCanvas()
  release()
  await assert.rejects(pending, /Board changed/)
  assert.equal(canvas.getObjects()[0], old)
  assert.equal(history.length, 1)
})

test('border edits persist atomically and older plot nodes default to a visible border', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(spec)
  const after = await controller.update(before.id, { border: false })
  assert.equal(after.id, before.id)
  assert.equal(after.border, false)
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(history.at(-1).removed.plotSpec.border, true)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(doc.objects[0].border, false)
  const restored = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(restored.objects[0].plotSpec.border, false)
  delete doc.objects[0].border
  const legacy = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(legacy.objects[0].plotSpec.border, true)
})

test('axis numbers edits persist and older plot nodes default to visible labels', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(spec)
  const after = await controller.update(before.id, { axisNumbers: false })
  assert.equal(after.id, before.id)
  assert.equal(after.axisNumbers, false)
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(history.at(-1).removed.plotSpec.axisNumbers, true)
  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(doc.objects[0].axisNumbers, false)
  const restored = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(restored.objects[0].plotSpec.axisNumbers, false)
  assert.equal(restored.objects[0].getObjects().some(child => child.isType('Text')), false)
  delete doc.objects[0].axisNumbers
  const legacy = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(legacy.objects[0].plotSpec.axisNumbers, true)
  assert.ok(legacy.objects[0].getObjects().some(child => child.isType('Text')))
})

test('transparent background edits persist, undo atomically and default opaque for legacy plots', async () => {
  const { controller, canvas, history } = setup()
  const before = await controller.create(spec)
  assert.equal(before.transparentBackground, false)
  const after = await controller.update(before.id, { transparentBackground: true })
  assert.equal(after.id, before.id)
  assert.equal(after.transparentBackground, true)
  assert.equal(history.at(-1).type, 'replace')
  assert.equal(history.at(-1).removed.plotSpec.transparentBackground, false)
  assert.equal(history.at(-1).added.getObjects()[0].fill, 'transparent')

  const doc = serializeBoardDocument({ canvas, boardObjectPolicy: policy })
  assert.equal(doc.version, 2)
  assert.equal(doc.objects[0].transparentBackground, true)
  const restored = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(restored.objects[0].plotSpec.transparentBackground, true)
  assert.equal(restored.objects[0].getObjects()[0].fill, 'transparent')

  delete doc.objects[0].transparentBackground
  const legacy = await materializeBoardDocument(doc, { buildFormula })
  assert.equal(legacy.objects[0].plotSpec.transparentBackground, false)
  assert.equal(legacy.objects[0].getObjects()[0].fill, '#f9f9f9')

  const opaque = await controller.update(before.id, { transparentBackground: false })
  assert.equal(opaque.transparentBackground, false)
  assert.equal(canvas.getObjects()[0].getObjects()[0].fill, '#f9f9f9')
})
