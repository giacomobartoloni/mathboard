/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

// This Worker handles opaque encrypted snapshots only. It never receives decryption keys.
export const SHARE_TTL_MS = 90 * 24 * 60 * 60 * 1000
export const MAX_CIPHERTEXT_BYTES = 2 * 1024 * 1024
const KEY_PREFIX = 'boards/'
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const STATIC_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...STATIC_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers },
})

const allowedOrigin = (origin, requestUrl) => origin === requestUrl.origin
  || ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'].includes(origin)

const cors = (origin, requestUrl) => allowedOrigin(origin, requestUrl)
  ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
  : {}

function idFromRandomBytes(bytes) {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function readBounded(body, limit) {
  if (!body) return null
  const reader = body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function handleShareRequest(request, env) {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  const corsHeaders = cors(origin, url)
  if (request.method === 'OPTIONS') {
    if (!allowedOrigin(origin, url)) return json({ error: 'forbidden' }, 403)
    return new Response(null, { status: 204, headers: {
      ...STATIC_HEADERS, ...corsHeaders,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    } })
  }
  if (!env.BOARD_SHARES || !env.SHARE_RATE_LIMITER) {
    return json({ error: 'unavailable' }, 503, corsHeaders)
  }
  const sourceIp = request.headers.get('CF-Connecting-IP') || 'unknown'
  const { success } = await env.SHARE_RATE_LIMITER.limit({ key: sourceIp })
  if (!success) return json({ error: 'rate_limited' }, 429, corsHeaders)

  if (request.method === 'POST' && url.pathname === '/api/shares') {
    if (!allowedOrigin(origin, url)) return json({ error: 'forbidden' }, 403, corsHeaders)
    if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/octet-stream') {
      return json({ error: 'invalid_content_type' }, 415, corsHeaders)
    }
    const declaredLength = Number(request.headers.get('Content-Length'))
    if (declaredLength > MAX_CIPHERTEXT_BYTES) return json({ error: 'too_large' }, 413, corsHeaders)
    const ciphertext = await readBounded(request.body, MAX_CIPHERTEXT_BYTES)
    if (!ciphertext) return json({ error: 'too_large' }, 413, corsHeaders)
    if (ciphertext.byteLength < 29) return json({ error: 'invalid_payload' }, 400, corsHeaders)

    const id = idFromRandomBytes(crypto.getRandomValues(new Uint8Array(16)))
    const expiresAt = Date.now() + SHARE_TTL_MS
    await env.BOARD_SHARES.put(KEY_PREFIX + id, ciphertext, {
      customMetadata: { expiresAt: String(expiresAt) },
      httpMetadata: { contentType: 'application/octet-stream' },
    })
    return json({ id, expiresAt: new Date(expiresAt).toISOString() }, 201, corsHeaders)
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/shares/')) {
    const id = url.pathname.slice('/api/shares/'.length)
    if (!ID_PATTERN.test(id)) return json({ error: 'invalid_id' }, 400, corsHeaders)
    const stored = await env.BOARD_SHARES.get(KEY_PREFIX + id)
    if (!stored) return json({ error: 'not_found' }, 404, corsHeaders)
    const expiresAt = Number(stored.customMetadata?.expiresAt)
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      return json({ error: 'expired' }, 410, corsHeaders)
    }
    return new Response(stored.body, { status: 200, headers: {
      ...STATIC_HEADERS, ...corsHeaders, 'Content-Type': 'application/octet-stream',
    } })
  }
  return json({ error: 'not_found' }, 404, corsHeaders)
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname
    if (pathname === '/api/shares' || pathname.startsWith('/api/shares/')) {
      try { return await handleShareRequest(request, env) }
      catch { return json({ error: 'unavailable' }, 503) }
    }
    return env.ASSETS.fetch(request)
  },
}
