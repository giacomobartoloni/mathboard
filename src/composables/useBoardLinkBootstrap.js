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

import { ANALYTICS_EVENTS, ANALYTICS_STAMP_SHARE_FAILURE_STAGES } from '../analytics/events.js'
import { readStampFromLocation, clearStampFromLocation } from '../stamps/url.js'
import {
  readBoardShareFromLocation,
  downloadBoardShare,
  clearBoardShareFromLocation,
} from '../share/boardShare.js'

/**
 * Bootstrap shared URLs while keeping the application responsible for deciding
 * whether to restore local persistence. Stamp and board links remain distinct.
 */
export function useBoardLinkBootstrap({
  drawBoardRef,
  boardError,
  selectedTool,
  desktopRuntime,
  waitForBoardReady,
  trackEvent,
  initializeAnalytics,
}) {
  const bootstrapStampFromUrl = async () => {
    const payload = readStampFromLocation()
    if (!payload) return false
    try {
      const ready = await waitForBoardReady()
      if (!ready || !drawBoardRef.value) {
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_FAILED, { stage: ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN })
        boardError.value = 'Board is not ready to load the stamp link.'
        return false
      }
      const result = await drawBoardRef.value.bootstrapFromStamp(payload)
      if (!result?.ok) {
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_FAILED, { stage: ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN })
        boardError.value = result?.message || 'Could not load stamp from the link.'
        return false
      }
      trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_OPENED)
      selectedTool.value = 'select'
      return true
    } catch (error) {
      trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_FAILED, { stage: ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN })
      boardError.value = error?.message || 'Could not load stamp from the link.'
      return false
    } finally {
      clearStampFromLocation()
    }
  }

  const bootstrapSharedBoardFromUrl = async () => {
    try {
      const share = readBoardShareFromLocation()
      if (!share) return false
      const ready = await waitForBoardReady()
      if (!ready || !drawBoardRef.value) throw new Error('Board is not ready.')
      const document = await downloadBoardShare(share, { desktop: desktopRuntime })
      try { await drawBoardRef.value.bootstrapSharedBoard(document) }
      catch {
        const failure = new Error('Could not create a local board from this link.')
        failure.stage = 'import'
        throw failure
      }
      trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_OPENED)
      selectedTool.value = 'select'
      return true
    } catch (error) {
      trackEvent(ANALYTICS_EVENTS.BOARD_SHARE_FAILED, { stage: error?.stage || 'download' })
      boardError.value = error?.message || 'Could not open shared board.'
      return false
    } finally {
      // Remove the decryption key before initializing third-party analytics.
      try { clearBoardShareFromLocation() }
      finally { initializeAnalytics() }
    }
  }

  return { bootstrapStampFromUrl, bootstrapSharedBoardFromUrl }
}
