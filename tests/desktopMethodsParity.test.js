/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getDesktopBoardMethods } from '../src/board/agent/desktop-commands.js'
import { getBoardCommandDescriptors } from '../src/board/agent/command-registry.js'

test('Rust and JavaScript desktop bridge allowlists agree exactly', () => {
  const source = readFileSync(new URL('../src-tauri/src/board_bridge.rs', import.meta.url), 'utf8')
  const methods = source.match(/const METHODS:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/)?.[1]
  assert.ok(methods, 'Rust board-bridge method list is missing')
  const nativeMethods = [...methods.matchAll(/"([^"]+)"/g)].map(match => match[1])
  const browserMethods = getDesktopBoardMethods()

  const registryMethods = getBoardCommandDescriptors().map(descriptor => descriptor.method)
  assert.equal(nativeMethods.length, registryMethods.length)
  assert.equal(new Set(nativeMethods).size, nativeMethods.length)
  assert.deepEqual([...nativeMethods].sort(), [...registryMethods].sort())
  assert.deepEqual(nativeMethods.filter(method => !method.startsWith('boards.')).sort(),
    [...browserMethods].sort())
  assert.equal(browserMethods.some(method => method.startsWith('boards.')), false)
})
