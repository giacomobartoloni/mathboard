/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { generateMcpToolSchemas } from '../tools/generate-mcp-tool-schemas.mjs'

test('MCP catalog matches the current JS read descriptors and rejects unknown fields', async () => {
  const committed = JSON.parse(await readFile(new URL('../src-tauri/resources/mcp-tool-schemas.json', import.meta.url)))
  assert.deepEqual(committed, generateMcpToolSchemas())
  assert.deepEqual(committed.map(tool => tool.name), [
    'mathboard_observe', 'mathboard_measure', 'mathboard_screenshot',
  ])
  assert.ok(committed.every(tool => tool.inputSchema.additionalProperties === false))
})
