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
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('normal development server does not expose local help or command routes', async t => {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), mode: 'development',
    // This HTTP-only probe never imports app modules; avoid an unrelated background dependency scan at teardown.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false } })
  t.after(() => server.close())
  await server.listen()
  const port = server.httpServer.address().port
  const help = await fetch(`http://127.0.0.1:${port}/__mathboard_agent/help`)
  assert.ok(!help.headers.get('content-type')?.includes('application/json'))
  assert.ok(!(await help.text()).includes('local-agent-vite-bridge'))
  const command = await fetch(`http://127.0.0.1:${port}/__mathboard_agent/command`, { method: 'POST',
    body: JSON.stringify({ method: 'observe' }) })
  assert.equal(command.status, 404)
})
