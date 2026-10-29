/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

// This is a separate Tauri-only entrypoint, never the shared board Vue root.
const byId = (id) => document.getElementById(id)
const controls = {
  enable: byId('enable'), read: byId('read'), screenshot: byId('screenshot'),
  revoke: byId('revoke'), refresh: byId('refresh'), close: byId('close'),
}
const errorView = byId('error')
const loadingView = byId('loading')
const controlView = byId('controls')
let permission = null
let busy = false

function hasReadGrant() {
  return Boolean(permission?.enabled && permission.readBoardId
    && permission.readBoardId === permission.activeBoardId)
}

function setError(message) {
  errorView.textContent = message || ''
  errorView.hidden = !message
}

function render() {
  const loaded = permission !== null
  loadingView.hidden = loaded
  controlView.hidden = !loaded
  if (!loaded) {
    controls.refresh.disabled = busy
    return
  }
  byId('board-id').textContent = permission.activeBoardId || 'Unavailable'
  const read = hasReadGrant()
  controls.enable.textContent = permission.enabled ? 'On' : 'Off'
  controls.enable.setAttribute('aria-pressed', String(permission.enabled))
  controls.enable.disabled = busy
  controls.read.textContent = read ? 'Allowed' : 'Allow'
  controls.read.setAttribute('aria-pressed', String(read))
  controls.read.disabled = busy || !permission.enabled || !permission.activeBoardId || read
  controls.screenshot.textContent = permission.screenshot ? 'Allowed' : 'Allow'
  controls.screenshot.setAttribute('aria-pressed', String(Boolean(permission.screenshot)))
  controls.screenshot.disabled = busy || !read || permission.screenshot
  controls.revoke.disabled = busy || (!read && !permission.screenshot)
  controls.refresh.disabled = busy
}

async function refresh() {
  if (busy) return
  busy = true
  setError(null)
  render()
  try {
    permission = await invoke('mcp_permission_status')
  } catch {
    setError('Unable to read local assistant permissions from MathBoard.')
  } finally {
    busy = false
    render()
  }
}

async function change(command, args = {}) {
  if (busy || !permission) return
  busy = true
  setError(null)
  render()
  try {
    permission = await invoke(command, args)
  } catch {
    setError(command === 'mcp_set_enabled'
      ? 'Local assistant connections are unavailable in this installation.'
      : 'The board or permissions changed. Refresh and try again.')
    try { permission = await invoke('mcp_permission_status') } catch { /* Keep visible state. */ }
  } finally {
    busy = false
    render()
  }
}

function expected() {
  return {
    expectedBoardId: permission.activeBoardId,
    expectedBoardEpoch: permission.boardEpoch,
    expectedGrantEpoch: permission.grantEpoch,
    expectedRendererGeneration: permission.rendererGeneration,
  }
}

controls.enable.addEventListener('click', () => {
  if (permission) void change('mcp_set_enabled', { enabled: !permission.enabled })
})
controls.read.addEventListener('click', () => {
  if (permission?.enabled && permission.activeBoardId && !hasReadGrant()) {
    void change('mcp_grant_read', expected())
  }
})
controls.screenshot.addEventListener('click', () => {
  if (hasReadGrant() && !permission.screenshot) {
    void change('mcp_grant_screenshot', expected())
  }
})
controls.revoke.addEventListener('click', () => void change('mcp_revoke_all'))
controls.refresh.addEventListener('click', () => void refresh())
controls.close.addEventListener('click', () => void getCurrentWindow().close())
window.addEventListener('focus', () => void refresh())

void refresh()
