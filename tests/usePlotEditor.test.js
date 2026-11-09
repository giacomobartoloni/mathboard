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

import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { usePlotEditor } from '../src/composables/usePlotEditor.js'

function createHarness(savePlot = async () => {}) {
  const previousDocument = globalThis.document
  const focused = []
  const graphButton = { focus: () => focused.push('graph') }
  const originalFocus = {
    isConnected: true,
    matches: () => true,
    focus: () => focused.push('original'),
  }
  globalThis.document = {
    activeElement: originalFocus,
    querySelector: (selector) =>
      selector === 'button[aria-label="Graph"]' ? graphButton : null,
  }
  const calls = []
  const drawBoardRef = ref({
    savePlot: async (...args) => {
      calls.push(args)
      return savePlot(...args)
    },
  })
  const selectedTool = ref('graph')
  const editor = usePlotEditor({ drawBoardRef, selectedTool })
  return {
    editor, calls, selectedTool, focused, originalFocus,
    restoreDocument() {
      if (previousDocument === undefined) delete globalThis.document
      else globalThis.document = previousDocument
    },
  }
}

test('create saves at the requested location, closes and restores focus', async () => {
  const h = createHarness()
  try {
    const position = { x: 12, y: 34 }
    const spec = { latex: 'x^2' }
    h.editor.onOpenPlot(position)
    assert.equal(h.editor.showPlotModal.value, true)
    assert.equal(h.editor.editingPlotSpec.value, null)
    await h.editor.onSubmitPlot(spec)
    assert.deepEqual(h.calls, [[spec, null, position]])
    assert.equal(h.editor.showPlotModal.value, false)
    assert.equal(h.editor.plotBusy.value, false)
    assert.equal(h.editor.plotError.value, '')
    assert.equal(h.selectedTool.value, 'select')
    assert.deepEqual(h.focused, ['original'])
  } finally {
    h.restoreDocument()
  }
})

test('edit keeps object identity and falls back to Graph button for focus', async () => {
  const h = createHarness()
  try {
    const initialSpec = { latex: 'x' }
    const updatedSpec = { latex: 'x+1' }
    h.editor.onEditPlot({ spec: initialSpec, id: 'graph-1' })
    assert.deepEqual(h.editor.editingPlotSpec.value, initialSpec)
    h.originalFocus.isConnected = false
    await h.editor.onSubmitPlot(updatedSpec)
    assert.deepEqual(h.calls, [[updatedSpec, 'graph-1', null]])
    assert.deepEqual(h.focused, ['graph'])
  } finally {
    h.restoreDocument()
  }
})

test('cancel and repeated submissions are blocked during an active save', async () => {
  let resolveSave
  const saving = new Promise(resolve => { resolveSave = resolve })
  const h = createHarness(() => saving)
  try {
    h.editor.onOpenPlot({ x: 10, y: 20 })
    const pending = h.editor.onSubmitPlot({ latex: 'x' })
    assert.equal(h.editor.plotBusy.value, true)
    await h.editor.closePlotModal()
    await h.editor.onSubmitPlot({ latex: 'x+1' })
    assert.equal(h.editor.showPlotModal.value, true)
    assert.equal(h.calls.length, 1)
    assert.deepEqual(h.focused, [])
    resolveSave()
    await pending
    assert.equal(h.editor.plotBusy.value, false)
    assert.equal(h.editor.showPlotModal.value, false)
    assert.deepEqual(h.focused, ['original'])
  } finally {
    h.restoreDocument()
  }
})

test('save failure leaves the editor open and permits cancellation', async () => {
  const h = createHarness(async () => {
    throw new Error('Save failed', { cause: new Error('Board changed while rendering.') })
  })
  try {
    h.editor.onEditPlot({ spec: { latex: 'x' }, id: 'graph-2' })
    await h.editor.onSubmitPlot({ latex: 'x^2' })
    assert.equal(h.editor.plotError.value, 'Board changed while rendering.')
    assert.equal(h.editor.plotBusy.value, false)
    assert.equal(h.editor.showPlotModal.value, true)
    assert.equal(h.selectedTool.value, 'graph')
    assert.deepEqual(h.focused, [])
    await h.editor.closePlotModal()
    assert.equal(h.editor.showPlotModal.value, false)
    assert.equal(h.selectedTool.value, 'select')
    assert.deepEqual(h.focused, ['original'])
  } finally {
    h.restoreDocument()
  }
})
