/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { handleShareRequest, SHARE_TTL_MS, MAX_CIPHERTEXT_BYTES } from '../worker/index.js'
import { encryptSharedBoard, decryptSharedBoard, BoardShareError } from '../src/share/boardShare.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'

if (!globalThis.crypto) globalThis.crypto = webcrypto

function fakeEnvironment() {
  const entries = new Map()
  return {
    entries,
    BOARD_SHARES: {
      async put(key, bytes, options) {
        entries.set(key, { data: new Uint8Array(bytes), customMetadata: options.customMetadata })
      },
      async get(key) {
        const entry = entries.get(key)
        return entry ? { customMetadata: entry.customMetadata, body: new Blob([entry.data]).stream() } : null
      },
    },
    SHARE_RATE_LIMITER: { async limit() { return { success: true } } },
  }
}

const endpoint = 'https://mathboard.app/api/shares'
const headers = { Origin: 'https://mathboard.app', 'Content-Type': 'application/octet-stream' }
test('encrypted board round-trip validates and never leaks plaintext into ciphertext', async () => {
  const board = createEmptyBoardDocument('Private test')
  const { bytes, key } = await encryptSharedBoard(board)
  assert.ok(bytes.length > 28)
  assert.ok(!new TextDecoder().decode(bytes).includes('Private test'))
  assert.deepEqual(await decryptSharedBoard(bytes, key), board)
  const tampered = new Uint8Array(bytes)
  tampered[tampered.length - 1] ^= 1
  await assert.rejects(decryptSharedBoard(tampered, key), error => error instanceof BoardShareError && error.stage === 'decrypt')
})
test('Worker stores only ciphertext and enforces 90-day expiry on every GET', async () => {
  const env = fakeEnvironment()
  const data = new Uint8Array(50).fill(7)
  const created = await handleShareRequest(new Request(endpoint, { method: 'POST', headers, body: data }), env)
  assert.equal(created.status, 201)
  const { id, expiresAt } = await created.json()
  assert.match(id, /^[A-Za-z0-9_-]{22}$/)
  assert.ok(new Date(expiresAt).getTime() - Date.now() > SHARE_TTL_MS - 10000)
  assert.deepEqual([...env.entries.get('boards/' + id).data], [...data])
  const shared = await handleShareRequest(new Request(endpoint + '/' + id), env)
  assert.equal(shared.status, 200)
  assert.deepEqual([...new Uint8Array(await shared.arrayBuffer())], [...data])
  env.entries.get('boards/' + id).customMetadata.expiresAt = String(Date.now() - 1)
  const expired = await handleShareRequest(new Request(endpoint + '/' + id), env)
  assert.equal(expired.status, 410)
})
test('Worker rejects oversized, malformed, cross-origin and missing shares', async () => {
  const env = fakeEnvironment()
  assert.equal((await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: new Uint8Array(MAX_CIPHERTEXT_BYTES + 1),
  }), env)).status, 413)
  assert.equal((await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: new Uint8Array(40),
  }), env)).status, 403)
  assert.equal((await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: new Uint8Array(10),
  }), env)).status, 400)
  assert.equal((await handleShareRequest(new Request(endpoint + '/not-an-id'), env)).status, 400)
  assert.equal((await handleShareRequest(new Request(endpoint + '/' + 'A'.repeat(22)), env)).status, 404)
  env.SHARE_RATE_LIMITER.limit = async () => ({ success: false })
  assert.equal((await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: new Uint8Array(40),
  }), env)).status, 429)
})
