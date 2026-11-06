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
import { createBoardLibraryAnalytics } from '../analytics/boardLibrary.js'

// Owns Boards data/actions and their UX signals; sidebar presentation is injected.
export function useBoardLibrary({ isReady, getWorkspace, getSidebar, resetSelectedTool, trackEvent }) {
  const boardList = ref([])
  const archivedList = ref([])
  const boardLibraryBusy = ref(false)
  const boardLibraryLoading = ref(false)
  const boardLibraryError = ref(null)
  const analytics = createBoardLibraryAnalytics(trackEvent)

  const refreshBoardLibrary = async () => {
    const workspace = getWorkspace()
    if (!workspace) throw new Error('Board workspace is not ready.')
    const [boards, archived] = await Promise.all([workspace.list(), workspace.listArchived()])
    boardList.value = boards
    archivedList.value = archived
  }

  const openBoardLibrary = async () => {
    const sidebar = getSidebar()
    if (!isReady.value || sidebar.isOpen.value) return
    boardLibraryError.value = null
    boardList.value = []
    archivedList.value = []
    boardLibraryLoading.value = true
    sidebar.open()
    analytics.opened()
    try { await refreshBoardLibrary() } catch (error) { boardLibraryError.value = error.message }
    finally { boardLibraryLoading.value = false }
  }

  const onBoardLibraryAction = async ({ action, boardId, title }) => {
    if (boardLibraryBusy.value) return
    const sidebar = getSidebar()
    const modeAtAction = sidebar.mode.value
    const switchedAwayFromActive = (action === 'archive' || action === 'delete')
      && boardList.value.some(board => board.id === boardId && board.isActive)
    boardLibraryError.value = null
    boardLibraryBusy.value = true
    try {
      const workspace = getWorkspace()
      if (!workspace) throw new Error('Board workspace is not ready.')
      if (action === 'create') await workspace.create({ title })
      else if (action === 'open') await workspace.open({ boardId })
      else if (action === 'unarchive-open') {
        await workspace.unarchive({ boardId })
        try { await workspace.open({ boardId }) }
        catch (error) { throw new Error(`Board restored but could not be opened. ${error?.message || ''}`.trim()) }
      }
      else if (action === 'rename') await workspace.rename({ boardId, title })
      else if (action === 'archive') await workspace.archive({ boardId })
      else if (action === 'unarchive') await workspace.unarchive({ boardId })
      else if (action === 'delete') await workspace.delete({ boardId, confirm: true })
      else throw new Error('Unsupported board library action.')
      await refreshBoardLibrary()
      analytics.actionFinished(action, 'success', modeAtAction)
      if (switchedAwayFromActive || action === 'create' || action === 'open' || action === 'unarchive-open') {
        resetSelectedTool()
        if (sidebar.mode.value === 'overlay') sidebar.dismiss('board_action')
      }
    } catch (error) {
      analytics.actionFinished(action, 'failure', modeAtAction)
      boardLibraryError.value = error?.message || 'Board library operation failed.'
      // A failed post-transition metadata write may still leave a new active board.
      try { await refreshBoardLibrary() } catch { /* Preserve the original error. */ }
    } finally {
      boardLibraryBusy.value = false
    }
  }

  const onActiveBoardChanged = () => {
    // Keep a pinned library in sync with agent-originated board transitions.
    if (getSidebar().isOpen.value && !boardLibraryBusy.value) {
      void refreshBoardLibrary().catch(error => {
        boardLibraryError.value = error?.message || 'Board list could not be refreshed.'
      })
    }
  }

  return {
    boardList, archivedList, boardLibraryBusy, boardLibraryLoading, boardLibraryError,
    openBoardLibrary, onBoardLibraryAction, onActiveBoardChanged,
    onBoardLibraryBrowse: action => analytics.browsed(action),
    onSidebarClosed: (mode, reason) => analytics.closed(mode, reason),
    onSidebarModeChanged: (mode, reason) => analytics.modeChanged(mode, reason),
  }
}
