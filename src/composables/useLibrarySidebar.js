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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const MIN_WIDTH = 320
const MAX_WIDTH = 560
const MIN_BOARD_WIDTH = 600

// Owns sidebar presentation only. The caller owns library data and UX events.
export function useLibrarySidebar({ isBusy, onClosed, onModeChanged }) {
  const mode = ref('closed')
  const width = ref(400)
  const viewportWidth = ref(window.innerWidth)
  const triggerRef = ref(null)

  const isOpen = computed(() => mode.value !== 'closed')
  const canPin = computed(() => viewportWidth.value >= MIN_WIDTH + MIN_BOARD_WIDTH)
  const maxWidth = computed(() =>
    Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, viewportWidth.value -
      (mode.value === 'pinned' ? MIN_BOARD_WIDTH : 24))))
  const resizable = computed(() => viewportWidth.value > MIN_BOARD_WIDTH && maxWidth.value > MIN_WIDTH)

  const setWidth = (value) => {
    width.value = Math.min(maxWidth.value, Math.max(MIN_WIDTH, Math.round(value)))
  }
  const open = () => {
    if (isOpen.value) return
    mode.value = 'overlay'
  }
  const dismiss = (reason) => {
    const previousMode = mode.value
    if (previousMode === 'closed') return
    mode.value = 'closed'
    onClosed(previousMode, reason)
  }
  const close = (reason = 'close_button') => {
    if (!isBusy()) dismiss(reason)
  }
  const restoreFocus = () => triggerRef.value?.focus()

  const togglePin = () => {
    if (isBusy()) return
    if (mode.value === 'overlay' && canPin.value) {
      setWidth(Math.min(width.value, viewportWidth.value - MIN_BOARD_WIDTH))
      mode.value = 'pinned'
      onModeChanged('pinned', 'user')
    } else if (mode.value === 'pinned') {
      mode.value = 'overlay'
      onModeChanged('overlay', 'user')
    }
  }

  const syncViewportWidth = () => {
    viewportWidth.value = window.innerWidth
    if (!canPin.value && mode.value === 'pinned') {
      // A focused pin control becomes disabled when docking is unavailable.
      const pinHadFocus = document.activeElement?.matches?.('.library-sidebar-pin-button')
      mode.value = 'overlay'
      onModeChanged('overlay', 'viewport')
      // Keep valid sidebar input focus; move focus from the board or pin to Close.
      void nextTick(() => {
        if (mode.value !== 'overlay') return
        const focused = document.activeElement
        if (pinHadFocus || !focused?.closest?.('.library-sidebar-panel') || focused?.matches?.(':disabled')) {
          document.querySelector('.library-sidebar-panel .library-sidebar-close-button')?.focus()
        }
      })
    }
    setWidth(width.value)
  }
  onMounted(() => window.addEventListener('resize', syncViewportWidth))
  onBeforeUnmount(() => window.removeEventListener('resize', syncViewportWidth))

  return {
    mode, width, minWidth: MIN_WIDTH, maxWidth, resizable, canPin, isOpen, triggerRef,
    setWidth, open, dismiss, close, restoreFocus, togglePin,
  }
}
