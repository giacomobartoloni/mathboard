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

import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Connect macOS board-history menu actions and all native fullscreen changes
 * to the existing Vue state. The native window is the source of truth.
 */
export async function connectDesktopWindow(
  { onUndo, onRedo, onFullscreenChange },
  { nativeWindow = getCurrentWindow(), subscribe = listen } = {},
) {
  const unlisteners = []
  let disposed = false
  let lastSync = 0

  const syncFullscreen = async () => {
    const revision = ++lastSync
    try {
      const fullscreen = await nativeWindow.isFullscreen()
      if (!disposed && revision === lastSync) onFullscreenChange(Boolean(fullscreen))
    } catch (error) {
      if (!disposed) console.warn('Could not read native fullscreen state:', error)
    }
  }

  try {
    unlisteners.push(await nativeWindow.onResized(() => { void syncFullscreen() }))
    unlisteners.push(await nativeWindow.onFocusChanged(() => { void syncFullscreen() }))
    unlisteners.push(await subscribe('mathboard-native-menu', ({ payload }) => {
      if (disposed) return
      if (payload === 'undo') onUndo()
      if (payload === 'redo') onRedo()
    }))
    await syncFullscreen()
  } catch (error) {
    disposed = true
    unlisteners.forEach((unlisten) => unlisten())
    throw error
  }

  return () => {
    disposed = true
    unlisteners.forEach((unlisten) => unlisten())
  }
}

export async function toggleDesktopFullscreen(nativeWindow = getCurrentWindow()) {
  const wasFullscreen = await nativeWindow.isFullscreen()
  await nativeWindow.setFullscreen(!wasFullscreen)
  return nativeWindow.isFullscreen()
}
