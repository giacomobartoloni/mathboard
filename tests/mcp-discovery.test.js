/*
MathBoard
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getLocalAgentHelp } from '../dev-agent/command-contract.js'

test('native MCP discovery matches the executable F033 registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mathboard-mcp-discovery-'))
  try {
    const script = fileURLToPath(new URL('../tools/generate-mcp-discovery.mjs', import.meta.url))
    execFileSync(process.execPath, [script, dir])
    const tools = JSON.parse(readFileSync(join(dir, 'mathboard-mcp-tools.json'), 'utf8'))
    const help = JSON.parse(readFileSync(join(dir, 'mathboard-mcp-help.json'), 'utf8'))
    const methods = getLocalAgentHelp().methods
      .filter(item => !['observe', 'measure', 'screenshot'].includes(item.method))
    assert.deepEqual(help.methods.map(item => item.method), methods.map(item => item.method))
    assert.equal(tools.length, methods.length + 1)
    assert.equal(tools.at(-1).name, 'mathboard_help')
    assert.equal(help.transport, 'mcp-streamable-http')
    assert.equal(help.commandEndpoint, undefined)
    const created = tools.find(item => item.name === 'mathboard_create')
    assert.deepEqual(created.inputSchema.required, ['spec'])
    assert.deepEqual(created.inputSchema.properties.spec,
      methods.find(item => item.method === 'create').paramsSchema.properties.spec)
    assert.ok(created.inputSchema.properties.boardId)
    const batch = tools.find(item => item.name === 'mathboard_create_many')
    assert.deepEqual(batch.inputSchema.required, ['specs'])
    const deletion = tools.find(item => item.name === 'mathboard_boards_delete')
    assert.deepEqual(deletion.inputSchema.required, ['boardId', 'confirm'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
