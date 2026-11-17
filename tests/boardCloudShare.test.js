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
test('desktop sharing sends ciphertext to the public API and returns a browser link', async () => {
  const originalFetch = globalThis.fetch
  const id = 'B'.repeat(22)
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, endpoint)
      assert.equal(options.method, 'POST')
      assert.equal(options.headers['Content-Type'], 'application/octet-stream')
      assert.ok(options.body instanceof Uint8Array)
      assert.ok(!new TextDecoder().decode(options.body).includes('Private desktop lesson'))
      return new Response(JSON.stringify({ id, expiresAt: '2027-01-01T00:00:00.000Z' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const document = createEmptyBoardDocument('Private desktop lesson')
    const share = await createBoardShare(document, { desktop: true })
    assert.match(share.url, /^https:\/\/mathboard\.app\/#b=B{22},[A-Za-z0-9_-]{43}$/)
    assert.equal(share.expiresAt, '2027-01-01T00:00:00.000Z')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('desktop WebViews can preflight, create and download shares with narrow CORS origins', async () => {
  for (const origin of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
    const env = fakeEnvironment()
    const preflight = await handleShareRequest(new Request(endpoint, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }), env)
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Content-Type/i)

    const upload = await handleShareRequest(new Request(endpoint, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(40),
    }), env)
    assert.equal(upload.status, 201)
    assert.equal(upload.headers.get('Access-Control-Allow-Origin'), origin)

    const { id } = await upload.json()
    const download = await handleShareRequest(new Request(endpoint + '/' + id, {
      headers: { Origin: origin },
    }), env)
    assert.equal(download.status, 200)
    assert.equal(download.headers.get('Access-Control-Allow-Origin'), origin)
  }

  const untrusted = await handleShareRequest(new Request(endpoint, {
    method: 'OPTIONS',
    headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' },
  }), fakeEnvironment())
  assert.equal(untrusted.status, 403)
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

test('manually promoted ciphertext preserves the same share ID and decryption key after expiry', async () => {
  const env = fakeEnvironment()
  const original = createEmptyBoardDocument('Durable math exercise')
  const { bytes, key } = await encryptSharedBoard(original)
  const created = await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: bytes,
  }), env)
  assert.equal(created.status, 201)
  const { id } = await created.json()
  const temporary = env.entries.get('boards/' + id)
  assert.ok(temporary)
  assert.equal(env.entries.has('permanent/' + id), false)

  // The administrator copies the encrypted bytes; no key, plaintext or new share ID is used.
  env.entries.set('permanent/' + id, {
    data: new Uint8Array(temporary.data),
    customMetadata: { expiresAt: '1' }, // Storage prefix, not copied TTL metadata, determines promotion.
  })
  temporary.customMetadata.expiresAt = String(Date.now() - 1)
  const promoted = await handleShareRequest(new Request(endpoint + '/' + id), env)
  assert.equal(promoted.status, 200)
  assert.deepEqual(await decryptSharedBoard(new Uint8Array(await promoted.arrayBuffer()), key), original)

  // R2's 90-day lifecycle eventually removes only the original boards/ object.
  env.entries.delete('boards/' + id)
  const surviving = await handleShareRequest(new Request(endpoint + '/' + id), env)
  assert.equal(surviving.status, 200)
  assert.deepEqual(await decryptSharedBoard(new Uint8Array(await surviving.arrayBuffer()), key), original)
  assert.equal(surviving.headers.get('Cache-Control'), 'no-store')
})

test('temporary shares remain 90-day limited and do not trigger permanent lookup before expiry', async () => {
  const env = fakeEnvironment()
  const data = new Uint8Array(40).fill(2)
  const created = await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: data,
  }), env)
  const { id } = await created.json()
  const originalGet = env.BOARD_SHARES.get
  const lookups = []
  env.BOARD_SHARES.get = async key => {
    lookups.push(key)
    return originalGet(key)
  }
  assert.equal((await handleShareRequest(new Request(endpoint + '/' + id), env)).status, 200)
  assert.deepEqual(lookups, ['boards/' + id])
  env.entries.get('boards/' + id).customMetadata.expiresAt = String(Date.now() - 1)
  assert.equal((await handleShareRequest(new Request(endpoint + '/' + id), env)).status, 410)
  assert.deepEqual(lookups.slice(1), ['boards/' + id, 'permanent/' + id])
  env.entries.delete('boards/' + id)
  assert.equal((await handleShareRequest(new Request(endpoint + '/' + id), env)).status, 404)
})

test('permanent storage failure fails closed without silently serving an expired share', async () => {
  const env = fakeEnvironment()
  const id = 'C'.repeat(22)
  env.entries.set('boards/' + id, {
    data: new Uint8Array(40),
    customMetadata: { expiresAt: String(Date.now() - 1) },
  })
  const originalGet = env.BOARD_SHARES.get
  env.BOARD_SHARES.get = async key => {
    if (key === 'permanent/' + id) throw new Error('Private storage details')
    return originalGet(key)
  }
  const originalLog = console.error
  const logs = []
  console.error = value => logs.push(value)
  try {
    const response = await handleShareRequest(new Request(endpoint + '/' + id), env)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'unavailable' })
    assert.ok(!logs.join('').includes(id))
    assert.ok(!logs.join('').includes('Private'))
  } finally {
    console.error = originalLog
  }
})

test('clients cannot create or promote permanent objects through the public API', async () => {
  const env = fakeEnvironment()
  const payload = new Uint8Array(40)
  const attempted = await handleShareRequest(new Request(endpoint + '/permanent', {
    method: 'POST', headers, body: payload,
  }), env)
  assert.equal(attempted.status, 404)
  assert.equal(env.entries.size, 0)
  const created = await handleShareRequest(new Request(endpoint, {
    method: 'POST', headers, body: payload,
  }), env)
  assert.equal(created.status, 201)
  const { id } = await created.json()
  assert.ok(env.entries.has('boards/' + id))
  assert.equal(env.entries.has('permanent/' + id), false)
})
