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
import { getLocalAgentHelp } from '../dev-agent/command-contract.js'

test('desktop exposes exactly eleven fixed canvas methods while development retains nineteen', async () => {
  const { getDesktopBoardMethods } = await import('../src/board/agent/desktop-commands.js')
  assert.deepEqual(getDesktopBoardMethods(), [
    'observe', 'measure', 'screenshot', 'create', 'createMany', 'update',
    'delete', 'deleteMany', 'clear', 'group', 'layout',
  ])
  assert.equal(getLocalAgentHelp().methods.length, 19)
})

test('desktop command execution rejects library methods before calling a workspace', async () => {
  const { executeDesktopBoardCommand } = await import('../src/board/agent/desktop-commands.js')
  const controller = { observe: () => ({ stable: true, objects: [] }) }
  assert.deepEqual(executeDesktopBoardCommand(controller, { method: 'observe', params: {} }),
    { stable: true, objects: [] })
  assert.throws(() => executeDesktopBoardCommand(controller, { method: 'boards.list', params: {} }),
    /Unsupported desktop board method/)
})

test('shared command descriptors contain no development HTTP transport status', async () => {
  const { getBoardCommandDescriptors } = await import('../src/board/agent/command-registry.js')
  const descriptors = getBoardCommandDescriptors()
  assert.equal(descriptors.length, 19)
  assert.equal(descriptors.some(entry => 'errors' in entry || 'successStatus' in entry), false)
})
