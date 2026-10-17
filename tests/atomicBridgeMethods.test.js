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

test('HTTP relay accepts documented methods and rejects unsupported methods before browser delivery', async (t) => {
  let middleware
  localAgentModePlugin().configureServer({ middlewares: { use: (handler) => { middleware = handler } } })
  const server = createServer((request, response) => middleware(request, response, () => { response.end() }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/__mathboard_agent/command`
  for (const method of ['observe', 'create', 'createMany', 'update', 'delete', 'deleteMany', 'clear']) {
    const response = await fetch(url, { method: 'POST', body: JSON.stringify({ method }) })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'board_unavailable')
  }
  for (const method of ['toString', 'constructor', '_deleteRoots', 'undo', '']) {
    const response = await fetch(url, { method: 'POST', body: JSON.stringify({ method }) })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'invalid_command')
  }
})
