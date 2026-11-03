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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { createTemporaryPanController } from '../src/board/interactions/TemporaryPanController.js'
import { isSpacePanKey } from '../src/config/shortcuts.js'

test('hold Space selects pan and release restores the original tool', () => {
  let tool = 'pencil'
  const pan = createTemporaryPanController({
    getTool: () => tool,
    setTool: (next) => { tool = next },
  })
  assert.equal(pan.press(), true)
  assert.equal(tool, 'pan')
  assert.equal(pan.press(), false)
  assert.equal(pan.isActive(), true)
  assert.equal(pan.release(), true)
  assert.equal(tool, 'pencil')
  assert.equal(pan.release(), false)
})

test('manual tool selection during Space hold is not reverted', () => {
  let tool = 'shapes'
  const pan = createTemporaryPanController({
    getTool: () => tool,
    setTool: (next) => { tool = next },
  })
  pan.press()
  pan.cancel()
  tool = 'select'
  assert.equal(pan.release(), false)
  assert.equal(tool, 'select')
  pan.press()
  pan.release()
  assert.equal(tool, 'select')
})

test('holding Space while already in pan does not change the selected tool', () => {
  let tool = 'pan'
  const pan = createTemporaryPanController({
    getTool: () => tool,
    setTool: (next) => { tool = next },
  })
  pan.press()
  pan.release()
  assert.equal(tool, 'pan')
})

test('Space shortcut requires no modifiers and accepts browser Space code', () => {
  assert.equal(isSpacePanKey({ key: ' ' }), true)
  assert.equal(isSpacePanKey({ code: 'Space', key: 'Unidentified' }), true)
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
    assert.equal(isSpacePanKey({ key: ' ', [modifier]: true }), false)
  }
  assert.equal(isSpacePanKey({ key: 'p' }), false)
})
