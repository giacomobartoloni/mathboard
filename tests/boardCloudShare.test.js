/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { handleShareRequest, SHARE_TTL_MS, MAX_CIPHERTEXT_BYTES } from '../worker/index.js'
import { encryptSharedBoard, decryptSharedBoard, createBoardShare, BoardShareError } from '../src/share/boardShare.js'
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

test('share upload surfaces actionable API and configuration errors without exposing board data', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  globalThis.window = { location: { origin: 'http://localhost:5173', pathname: '/' } }
  try {
    const document = createEmptyBoardDocument('Private class lesson')
    const expected = [
      [403, 'Please try again later'],
      [404, 'Sharing is not available'],
      [413, 'too large'],
      [429, 'Too many sharing attempts'],
      [503, 'Sharing is temporarily unavailable'],
      [502, 'Sharing is temporarily unavailable'],
    ]
    for (const [status, phrase] of expected) {
      globalThis.fetch = async () => new Response(null, { status })
      await assert.rejects(createBoardShare(document), error => (
        error instanceof BoardShareError
        && error.stage === 'upload'
        && error.message.includes(phrase)
        && !error.message.includes(document.title)
        && !/Cloudflare|Worker|R2|server|storage|API/i.test(error.message)
      ))
    }
    // Vite can respond with HTML to an unhandled API route, rather than JSON.
    globalThis.fetch = async () => new Response('<html>Not an API</html>', {
      status: 200, headers: { 'Content-Type': 'text/html' },
    })
    await assert.rejects(createBoardShare(document), error => (
      error instanceof BoardShareError
      && error.stage === 'upload'
      && error.message.includes('Could not create a share link right now')
    ))
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})

test('Worker returns unavailable if Cloudflare bindings have not been configured', async () => {
  const response = await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: new Uint8Array(40),
  }), {})
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'unavailable' })
})

test('Worker logs only allowlisted reason codes for missing bindings and storage errors', async () => {
  const originalError = console.error
  const logs = []
  console.error = message => logs.push(JSON.parse(message))
  try {
    const absent = await handleShareRequest(new Request(endpoint, {
      method: 'POST', headers, body: new Uint8Array(40),
    }), {})
    assert.equal(absent.status, 503)
    assert.deepEqual(logs[0], {
      event: 'board_share_failure', operation: 'request', reason: 'missing_bindings',
    })

    const env = fakeEnvironment()
    env.BOARD_SHARES.put = async () => { throw new Error('Private formula') }
    const failedUpload = await handleShareRequest(new Request(endpoint, {
      method: 'POST', headers, body: new Uint8Array(40),
    }), env)
    assert.equal(failedUpload.status, 503)
    assert.deepEqual(logs[1], {
      event: 'board_share_failure', operation: 'upload', reason: 'storage_write_failed',
    })

    env.BOARD_SHARES.get = async () => { throw new Error('Private plot') }
    const failedRead = await handleShareRequest(new Request(endpoint + '/' + 'A'.repeat(22)), env)
    assert.equal(failedRead.status, 503)
    assert.deepEqual(logs[2], {
      event: 'board_share_failure', operation: 'download', reason: 'storage_read_failed',
    })
    assert.ok(!JSON.stringify(logs).includes('Private'))
    assert.ok(!JSON.stringify(logs).includes('A'.repeat(22)))
  } finally {
    console.error = originalError
  }
})
