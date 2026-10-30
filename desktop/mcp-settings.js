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
  enable: byId('enable'), copyEndpoint: byId('copy-endpoint'), close: byId('close'),
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
  if (!loaded) return
  controls.enable.checked = pendingEnabled ?? permission.enabled
  byId('enable-state').textContent = pendingEnabled === null
    ? (permission.enabled ? 'Enabled' : 'Disabled')
    : (pendingEnabled ? 'Enabling…' : 'Disabling…')
  controls.enable.disabled = busy || !permission.available
  byId('connection').hidden = !permission.enabled || !permission.available
  byId('endpoint').textContent = permission.enabled ? permission.endpoint || '' : ''
  if (!permission.enabled) byId('copy-status').textContent = ''
  controls.copyEndpoint.disabled = busy || !permission.enabled || !permission.available || !permission.endpoint
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


async function copyEndpoint() {
  if (busy || !permission?.enabled || !permission.available || !permission.endpoint) return
  const endpoint = permission.endpoint
  byId('copy-status').textContent = ''
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(endpoint)
  } catch {
    // Native WebViews may not grant the asynchronous Clipboard API.
    const field = document.createElement('textarea')
    field.value = endpoint
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    let copied = false
    try { copied = document.execCommand('copy') } catch { /* Use manual copy fallback. */ } finally { field.remove() }
    if (!copied) {
      setError('Unable to copy the MCP URL automatically. Select the URL and copy it manually.')
      return
    }
  }
  setError(null)
  if (permission.enabled) byId('copy-status').textContent = 'MCP URL copied to clipboard.'
}

controls.enable.addEventListener('change', () => {
  if (permission && !busy) void change('mcp_set_enabled', { enabled: controls.enable.checked })
})
controls.copyEndpoint.addEventListener('click', () => void copyEndpoint())
controls.close.addEventListener('click', () => void getCurrentWindow().close())
window.addEventListener('focus', () => void refresh())

void refresh()
