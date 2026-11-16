/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const configuration = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
)

test('desktop board sharing permits only the public MathBoard host and existing IPC', () => {
  const csp = configuration.app.security.csp
  assert.deepEqual(csp['connect-src'].split(/\s+/), [
    'ipc:', 'http://ipc.localhost', 'https://mathboard.app',
  ])
  assert.equal(csp['script-src'], "'self'")
  assert.equal(csp['object-src'], "'none'")
})
