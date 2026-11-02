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

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { getBoardCommandDescriptors } from '../src/board/agent/command-registry.js'

const output = new URL('../src-tauri/resources/mcp-tool-schemas.json', import.meta.url)
const methods = ['observe', 'measure', 'screenshot']
const boardId = { type: 'string', pattern: '^mb_[A-Za-z0-9_-]+$', minLength: 4, maxLength: 131 }

export function generateMcpToolSchemas() {
  const descriptors = getBoardCommandDescriptors()
  const commands = descriptors.filter(entry => !methods.includes(entry.method)).map(entry => entry.method)
  return [...methods.map(method => {
    const descriptor = descriptors.find(entry => entry.method === method)
    if (!descriptor || descriptor.mutatesBoard) throw new Error(`Invalid MCP read method: ${method}`)
    const inputSchema = structuredClone(descriptor.paramsSchema)
    inputSchema.properties = { boardId: structuredClone(boardId), ...inputSchema.properties }
    inputSchema.required = [...inputSchema.required]
    if (method === 'observe') inputSchema.properties.detail.default = 'summary'
    inputSchema.additionalProperties = false
    return { name: `mathboard_${method}`, description: descriptor.summary, inputSchema }
  }), {
    name: 'mathboard_command',
    description: 'Execute one existing MathBoard drawing or library operation. BoardId defaults to the open board; boards.* operations use params.boardId where applicable. Re-observe after timeouts or board transitions before retrying writes.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: commands },
        boardId: structuredClone(boardId),
        params: { type: 'object' },
      },
      required: ['method'],
      additionalProperties: false,
    },
  }]
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const generated = `${JSON.stringify(generateMcpToolSchemas(), null, 2)}\n`
  if (process.argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== generated) throw new Error('MCP tool schemas are stale')
  } else await writeFile(output, generated)
}
