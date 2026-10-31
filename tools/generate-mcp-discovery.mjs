// MathBoard
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Generate native MCP discovery from the executable F033 command descriptors.
// Do not manually maintain a second set of command argument schemas.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { getLocalAgentHelp } from '../dev-agent/command-contract.js'

const output = process.argv[2]
if (!output) throw new Error('Expected generated artifact output directory')
const allowed = [
  'create', 'createMany', 'update', 'delete', 'deleteMany', 'clear', 'group',
  'layout', 'boards.list', 'boards.create', 'boards.open', 'boards.rename',
  'boards.listArchived', 'boards.archive', 'boards.unarchive', 'boards.delete',
]
const source = getLocalAgentHelp()
const discovered = source.methods.filter(entry => !['observe', 'measure', 'screenshot'].includes(entry.method))
if (new Set(discovered.map(entry => entry.method)).size !== allowed.length
  || allowed.some(method => !discovered.some(entry => entry.method === method))) {
  throw new Error('MCP command allowlist drifted from the executable F033 registry')
}
const toolName = method => 'mathboard_' + method
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2').replaceAll('.', '_').toLowerCase()
const boardId = { type: 'string', pattern: '^mb_[A-Za-z0-9_-]+$', minLength: 4, maxLength: 131 }
const tools = discovered.map(entry => {
  const schema = structuredClone(entry.paramsSchema)
  if (!entry.method.startsWith('boards.')) schema.properties.boardId = boardId
  return {
    name: toolName(entry.method),
    description: entry.summary + ' Arguments correspond to ' + entry.method
      + '. Example: ' + JSON.stringify(entry.example.params),
    inputSchema: schema,
  }
})
tools.push({
  name: 'mathboard_help',
  description: 'Discover MathBoard command names, exact argument/result schemas, safe errors and examples. Pass method for detailed help; omit to list methods. No board data is read.',
  inputSchema: {
    type: 'object',
    properties: { method: { type: 'string', enum: allowed } },
    required: [],
    additionalProperties: false,
  },
})
const help = {
  schemaVersion: source.schemaVersion,
  schemaDialect: source.schemaDialect,
  transport: 'mcp-streamable-http',
  methods: discovered.map(({ successStatus, ...entry }) => entry),
  objectTypes: source.objectTypes,
  patchSchemas: source.patchSchemas,
  examplesByType: source.examplesByType,
  limitations: source.limitations.filter(line => !line.includes('dev/production')),
}
mkdirSync(resolve(output), { recursive: true })
writeFileSync(resolve(output, 'mathboard-mcp-tools.json'), JSON.stringify(tools))
writeFileSync(resolve(output, 'mathboard-mcp-help.json'), JSON.stringify(help))
