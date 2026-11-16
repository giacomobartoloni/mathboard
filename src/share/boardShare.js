/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/

import { BOARD_DOCUMENT_MAX_BYTES, validateBoardDocument } from '../board/persistence/schema.js'

export const SHARE_MAX_CIPHERTEXT_BYTES = 2 * 1024 * 1024
const API_PATH = '/api/shares'
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/

export class BoardShareError extends Error {
  constructor(stage, message) {
    super(message)
    this.name = 'BoardShareError'
    this.stage = stage
  }
}

function toBase64url(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

async function boundedBytes(stream, maxBytes) {
  const reader = stream.getReader()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel()
        throw new Error('Payload exceeds size limit')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') {
    throw new BoardShareError('encrypt', 'This browser does not support compressed sharing.')
  }
  return new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
}

function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new BoardShareError('decrypt', 'This browser cannot read compressed shares.')
  }
  return new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
}

export async function encryptSharedBoard(document) {
  let raw
  try {
    raw = new TextEncoder().encode(JSON.stringify(validateBoardDocument(document)))
  } catch {
    throw new BoardShareError('snapshot', 'Could not capture a valid board snapshot.')
  }
  if (raw.byteLength > BOARD_DOCUMENT_MAX_BYTES) {
    throw new BoardShareError('snapshot', 'Board exceeds the document size limit.')
  }
  try {
    const compressed = await boundedBytes(gzip(raw), SHARE_MAX_CIPHERTEXT_BYTES)
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
    const data = new Uint8Array(iv.byteLength + encrypted.byteLength)
    data.set(iv)
    data.set(encrypted, iv.byteLength)
    if (data.length > SHARE_MAX_CIPHERTEXT_BYTES) throw new Error('Encrypted payload too large')
    return { bytes: data, key: toBase64url(keyBytes) }
  } catch (error) {
    if (error instanceof BoardShareError) throw error
    throw new BoardShareError('encrypt', 'Could not encrypt this board. Try exporting a file instead.')
  }
}

export async function decryptSharedBoard(ciphertext, encodedKey) {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.length < 29 || ciphertext.length > SHARE_MAX_CIPHERTEXT_BYTES
    || !KEY_PATTERN.test(encodedKey)) {
    throw new BoardShareError('decrypt', 'Shared board payload is invalid.')
  }
  try {
    const keyBytes = fromBase64url(encodedKey)
    if (keyBytes.length !== 32) throw new Error('Invalid key size')
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt'])
    const plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ciphertext.slice(0, 12) }, key, ciphertext.slice(12),
    ))
    const bytes = await boundedBytes(gunzip(plain), BOARD_DOCUMENT_MAX_BYTES)
    return validateBoardDocument(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  } catch {
    throw new BoardShareError('decrypt', 'This share link is corrupted or cannot be decrypted.')
  }
}

export function readBoardShareFromLocation(location = window.location) {
  const hash = location.hash?.startsWith('#') ? location.hash.slice(1) : location.hash
  if (!hash) return null
  const params = new URLSearchParams(hash)
  if (!params.has('b')) return null
  const [id, key, extra] = (params.get('b') || '').split(',')
  if (!ID_PATTERN.test(id || '') || !KEY_PATTERN.test(key || '') || extra !== undefined) {
    throw new BoardShareError('download', 'This board share link is invalid.')
  }
  return { id, key }
}

export function clearBoardShareFromLocation(location = window.location) {
  const url = new URL(location.href)
  const params = new URLSearchParams(url.hash.slice(1))
  params.delete('b')
  url.hash = params.toString()
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export async function createBoardShare(document, { desktop = false } = {}) {
  const { bytes, key } = await encryptSharedBoard(document)
  const origin = desktop ? 'https://mathboard.app' : window.location.origin
  let response
  try {
    response = await fetch(origin + API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    })
  } catch {
    throw new BoardShareError('upload', 'Could not connect to share storage.')
  }
  if (!response.ok) {
    const messages = {
      403: 'Board sharing was denied by the server. Check the app origin.',
      404: 'Board sharing is not available on this server. Run MathBoard through its Cloudflare Worker.',
      413: 'This board is too large to share as a link. Export a file instead.',
      415: 'The share service rejected this request. Refresh MathBoard and try again.',
      429: 'Too many share attempts. Try again later.',
      503: 'Board sharing is unavailable. Check the Cloudflare Worker and R2 configuration.',
    }
    const message = messages[response.status]
      || (response.status >= 500
        ? 'The share service is temporarily unavailable. Try again later.'
        : 'Could not upload this board. Please retry.')
    throw new BoardShareError('upload', message)
  }
  let body
  try { body = await response.json() }
  catch {
    throw new BoardShareError('upload',
      'The share service is not responding correctly. Run MathBoard through its Cloudflare Worker.')
  }
  if (!ID_PATTERN.test(body?.id || '')) {
    throw new BoardShareError('upload', 'Share service returned an invalid link.')
  }
  const pathname = desktop ? '/' : window.location.pathname
  return { url: `${origin}${pathname}#b=${body.id},${key}`, expiresAt: body.expiresAt }
}

export async function downloadBoardShare({ id, key }, { desktop = false } = {}) {
  const origin = desktop ? 'https://mathboard.app' : window.location.origin
  let response
  try { response = await fetch(origin + API_PATH + '/' + id, { cache: 'no-store' }) }
  catch { throw new BoardShareError('download', 'Could not connect to share storage.') }
  if (response.status === 410) throw new BoardShareError('expired', 'This share link expired after 90 days.')
  if (!response.ok) throw new BoardShareError('download', 'This shared board was not found.')
  let bytes
  try { bytes = await boundedBytes(response.body, SHARE_MAX_CIPHERTEXT_BYTES) }
  catch { throw new BoardShareError('download', 'Shared board exceeds the size limit.') }
  return decryptSharedBoard(bytes, key)
}
