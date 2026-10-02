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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * Read stamp payload from the URL. Prefer `#s=...` (hash fragment).
 * Query `?s=` is accepted as a fallback for shared links.
 */
export function readStampFromLocation(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return null

  const hash = typeof loc.hash === 'string' && loc.hash.startsWith('#')
    ? loc.hash.slice(1)
    : (loc.hash || '')
  if (hash) {
    const hashParams = new URLSearchParams(hash)
    if (hashParams.has('s')) {
      const value = hashParams.get('s')
      if (value) return value
    }
  }

  const search = typeof loc.search === 'string' ? loc.search : ''
  if (search) {
    const query = new URLSearchParams(search)
    if (query.has('s')) {
      const value = query.get('s')
      if (value) return value
    }
  }

  return null
}

/**
 * Drop the stamp payload from the current URL without reloading.
 * Keeps pathname and other query params; clears a stamp-only hash.
 */
export function clearStampFromLocation(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc || typeof history === 'undefined' || typeof history.replaceState !== 'function') {
    return
  }

  const url = new URL(loc.href)
  url.searchParams.delete('s')

  let nextHash = ''
  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (rawHash) {
    const hashParams = new URLSearchParams(rawHash)
    if (hashParams.has('s')) {
      hashParams.delete('s')
      const remaining = hashParams.toString()
      nextHash = remaining ? `#${remaining}` : ''
    } else {
      nextHash = url.hash
    }
  }

  const next = `${url.pathname}${url.search}${nextHash}`
  const current = `${loc.pathname}${loc.search}${loc.hash}`
  if (next !== current) {
    history.replaceState(null, '', next)
  }
}
