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
import { createServer } from 'node:http'
import { once } from 'node:events'
import { localAgentModePlugin } from '../tools/vite/local-agent-mode-plugin.mjs'

async function serve(t) {
  let middleware
  localAgentModePlugin().configureServer({ middlewares: { use(handler) { middleware = handler } } })
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  return `http://127.0.0.1:${server.address().port}/__mathboard_agent/`
}

test('disconnected help is bounded, deterministic JSON without board contents or internal operations', async t => {
  const url = await serve(t)
  const a = await fetch(url + 'help')
  assert.equal(a.status, 200)
  assert.match(a.headers.get('content-type'), /application\/json/)
  const text = await a.text()
  const help = JSON.parse(text)
  assert.equal(text, await (await fetch(url + 'help')).text())
  assert.ok(text.length < 60000)
  assert.equal(help.schemaVersion, 1)
  assert.deepEqual(help.methods.map(m => m.method), ['observe', 'create', 'createMany', 'update', 'delete'])
  assert.equal(help.browserConnected, undefined)
  assert.equal(help.objects, undefined)
  assert.ok(!text.includes('/events'))
  assert.ok(!text.includes('/result'))
  const health = await (await fetch(url + 'health')).json()
  assert.deepEqual(health, { ok: true, browserConnected: false, pendingCommands: 0 })
})

test('unsupported methods reject before connection checks and known methods retain unavailable errors', async t => {
  const url = await serve(t)
  for (const method of ['clear', 'constructor', '__proto__', 'observeBoard', 'events', 'result']) {
    const response = await fetch(url + 'command', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params: {} }) })
    assert.equal(response.status, 400, method)
    assert.equal((await response.json()).error.code, 'invalid_command')
  }
  const known = await fetch(url + 'command', { method: 'POST', body: JSON.stringify({ method: 'observe' }) })
  assert.equal(known.status, 503)
  assert.equal((await known.json()).error.code, 'board_unavailable')
  const malformed = await fetch(url + 'command', { method: 'POST', body: '{' })
  assert.equal(malformed.status, 400)
  const writeHelp = await fetch(url + 'help', { method: 'POST', body: '{}' })
  assert.equal(writeHelp.status, 404)
})
