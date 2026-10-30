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
  enable: byId('enable'), refresh: byId('refresh'), close: byId('close'),
}
const errorView = byId('error')
const loadingView = byId('loading')
const controlView = byId('controls')
let permission = null
let busy = false
let pendingEnabled = null

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
  controls.enable.checked = pendingEnabled ?? permission.enabled
  byId('enable-state').textContent = pendingEnabled === null
    ? (permission.enabled ? 'Enabled' : 'Disabled')
    : (pendingEnabled ? 'Enabling…' : 'Disabling…')
  controls.enable.disabled = busy || !permission.available
  byId('connection').hidden = !permission.enabled || !permission.available
  byId('endpoint').textContent = permission.enabled ? permission.endpoint || '' : ''
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
  pendingEnabled = typeof args.enabled === 'boolean' ? args.enabled : null
  setError(null)
  render()
  try {
    permission = await invoke(command, args)
  } catch {
    setError('Local MCP is unavailable in this installation.')
    try { permission = await invoke('mcp_permission_status') } catch { /* Keep visible state. */ }
  } finally {
    pendingEnabled = null
    busy = false
    render()
  }
}

controls.enable.addEventListener('change', () => {
  if (permission && !busy) void change('mcp_set_enabled', { enabled: controls.enable.checked })
})
controls.refresh.addEventListener('click', () => void refresh())
controls.close.addEventListener('click', () => void getCurrentWindow().close())
window.addEventListener('focus', () => void refresh())

void refresh()
