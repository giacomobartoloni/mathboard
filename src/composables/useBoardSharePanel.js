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

import { ref } from 'vue'
import { ANALYTICS_EVENTS } from '../analytics/events.js'
import { createBoardShare } from '../share/boardShare.js'

/**
 * Owns the explicit, two-step Share Board interaction and its analytics.
 * Opening the panel never captures a document or initiates a network request.
 * Incoming links and selection Stamp sharing have separate lifecycles.
 */
export function useBoardSharePanel({ boardSessionReady, drawBoardRef, desktopRuntime, trackEvent }) {
  const showBoardSharePanel = ref(false)
  const boardShareBusy = ref(false)
  const boardShareUrl = ref('')
  const boardShareError = ref('')

  const openBoardSharePanel = () => {
    if (!boardSessionReady.value || showBoardSharePanel.value) return
    boardShareUrl.value = ''
    boardShareError.value = ''
    showBoardSharePanel.value = true
    trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_PANEL_OPENED)
  }
  const closeBoardSharePanel = () => {
    if (!showBoardSharePanel.value || boardShareBusy.value) return
    trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_PANEL_CLOSED, {
      outcome: boardShareUrl.value ? 'created' : 'abandoned',
    })
    showBoardSharePanel.value = false
    boardShareUrl.value = ''
    boardShareError.value = ''
  }
  const requestBoardShareLink = async () => {
    if (!showBoardSharePanel.value || boardShareBusy.value || boardShareUrl.value) return
    trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_REQUESTED)
    boardShareError.value = ''
    boardShareBusy.value = true
    try {
      let document
      try { document = drawBoardRef.value.captureBoardDocument() }
      catch {
        const error = new Error('Finish editing before sharing this board.')
        error.stage = 'snapshot'
        throw error
      }
      const result = await createBoardShare(document, { desktop: desktopRuntime })
      boardShareUrl.value = result.url
      trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_CREATED)
    } catch (error) {
      trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_FAILED, { stage: error?.stage || 'upload' })
      boardShareError.value = error?.message || 'Could not create share link. Please retry.'
    } finally { boardShareBusy.value = false }
  }
  const onBoardShareCopied = () => trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_COPIED)
  const onBoardShareCopyFailed = () => {
    trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_FAILED, { stage: 'copy' })
    boardShareError.value = 'Could not copy the link. Select and copy it manually.'
  }

  return {
    showBoardSharePanel, boardShareBusy, boardShareUrl, boardShareError,
    openBoardSharePanel, closeBoardSharePanel, requestBoardShareLink,
    onBoardShareCopied, onBoardShareCopyFailed,
  }
}
