<!--
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
-->

<template>
  <div
    id="app"
    ref="fullscreenRootRef"
    :aria-busy="!boardSessionReady"
    :data-theme="uiTheme"
    :data-fullscreen="isFullscreen ? 'true' : 'false'"
  >
    <div class="board-topbar">
      <span class="logo">MathBoard</span>
      <button ref="boardLibraryTriggerRef" class="board-library-trigger" type="button" :disabled="!boardSessionReady"
        aria-label="Open Board library" title="Open Board library"
        :aria-expanded="showBoardLibrary" aria-haspopup="dialog" :inert="showBoardLibrary" @click="openBoardLibrary">
        <font-awesome-icon :icon="['fas', 'chalkboard']" aria-hidden="true" />
        <span class="board-library-trigger-label">
          <span class="board-library-trigger-label-long">Board library</span>
          <span class="board-library-trigger-label-short" aria-hidden="true">Boards</span>
        </span>
        <font-awesome-icon :icon="['fas', 'chevron-down']" aria-hidden="true" />
      </button>
    </div>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <div :inert="!boardSessionReady || showFormulaModal || showShareStampModal || showBoardLibrary">
      <DrawBoard
        :id="'board'"
        :selectedTool="selectedTool"
        :selectedShape="selectedShape"
        :session-ready="boardSessionReady"
        :board-theme="boardTheme"
        :selected-color="selectedColor"
        :selection-panel-suspended="showFormulaModal || showShareStampModal"
        ref="drawBoardRef"
        @request-formula="onRequestFormula"
        @edit-formula="onEditFormula"
        @text-editing-completed="onTextEditingCompleted"
        @shape-drawing-completed="onShapeDrawingCompleted"
        @selection-color="onSelectionColor"
        @persistence-status="onPersistenceStatus"
      />
      <ToolsPanel
        :selectedTool="selectedTool"
        :selected-shape="selectedShape"
        :selected-color="selectedColor"
        :display-color="displayColor"
        :main-color="boardThemeConfig.defaultInk"
        :main-ink-is-light="mainInkIsLight"
        @tool-selected="onToolSelected"
        @shape-selected="onShapeSelected"
        @color-selected="onColorSelected"
        @insert-kit="onInsertKit"
      />

    </div>
    <BoardLibraryModal v-if="showBoardLibrary" :boards="boardList" :archived-boards="archivedList"
      :busy="boardLibraryBusy" :loading="boardLibraryLoading" :error="boardLibraryError" :is-desktop="desktopRuntime"
      @close="closeBoardLibrary" @action="onBoardLibraryAction" />

    <div v-if="!boardSessionReady" class="board-session-loading" role="status" aria-label="Loading board">Loading board…</div>

    <div v-if="boardError" class="stamp-error" role="alert">
      <span>{{ boardError }}</span>
      <button type="button" @click="boardError = null" aria-label="Dismiss">×</button>
    </div>
    <div v-if="saveConflict" class="stamp-error" role="alert">
      <span>This board changed in another tab. Save your current work as a copy before opening the newer board.</span>
      <button class="save-copy-button" type="button" :disabled="recoveringConflict" @click="recoverConflict">
        {{ recoveringConflict ? 'Saving…' : 'Save a copy' }}
      </button>
    </div>
    
    <FormulaModal 
      v-if="showFormulaModal"
      :isVisible="showFormulaModal"
      :initialLatex="editingLatex"
      :mode="formulaModalMode"
      @close="onFormulaModalClose"
      @insert-formula="onInsertFormula"
      @assist-used="onFormulaAssistUsed"
    />

    <ShareStampModal
      v-if="showShareStampModal"
      :isVisible="showShareStampModal"
      :url="shareStampUrl"
      @close="closeShareStampModal"
      @copied="onStampShareCopied"
      @copy-failed="onStampShareCopyFailed"
    />
    
    <ZoomPanel 
      :inert="showBoardLibrary"
      :zoomLevel="zoomLevel"
      :board-theme="boardTheme"
      :is-fullscreen="isFullscreen"
      :fullscreen-supported="fullscreenSupported"
      @zoom-in="onZoomIn"
      @zoom-out="onZoomOut"
      @reset-zoom="onResetZoom"
      @undo="onUndo"
      @redo="onRedo"
      @cycle-theme="onCycleTheme"
      @toggle-fullscreen="toggleFullscreen"
    />
    
    <SupportPanel class="secondary-chrome" :inert="showBoardLibrary" />
    
    <span class="copyright secondary-chrome">© 2026 MathBoard.app • Made with <font-awesome-icon :icon="['fas', 'heart']" /> in Florence • All Rights Reserved</span>
  </div>
</template>

<script>
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import DrawBoard from './components/DrawBoard.vue'
import BoardLibraryModal from './components/BoardLibraryModal.vue'
import ToolsPanel from './components/ToolsPanel.vue'
// Deferred until opened: FormulaModal brings the KaTeX preview renderer.
const FormulaModal = defineAsyncComponent(() => import('./components/FormulaModal.vue'))
const ShareStampModal = defineAsyncComponent(() => import('./components/ShareStampModal.vue'))
import SupportPanel from './components/SupportPanel.vue'
import ZoomPanel from './components/ZoomPanel.vue'
import {
  BOARD_THEMES,
  loadThemePreferences,
  normalizeBoardTheme,
  saveUiTheme,
  saveBoardTheme,
  cycleBoardTheme,
  uiThemeForBoardTheme,
} from './config/themes'
import { normalizeHexColor } from './config/colors'
import {
  isDeleteShortcut,
  isDuplicateShortcut,
  isEscapeShortcut,
  isGroupShortcut,
  isPlainColorDigit,
  isPlainShapeKey,
  isPlainToolKey,
  isRedoShortcut,
  isShareStampLinkShortcut,
  isSelectAllShortcut,
  isUngroupShortcut,
  isUndoShortcut,
  isZoomInShortcut,
  isZoomOutShortcut,
  isZoomResetShortcut,
  shouldIgnoreGlobalShortcut,
} from './config/shortcuts'
import { isDesktopRuntime } from './platform/runtime'
import { connectDesktopWindow, toggleDesktopFullscreen } from './platform/nativeDesktop'
import { trackEvent } from './analytics'
import {
  ANALYTICS_EVENTS,
  ANALYTICS_FORMULA_MODES,
  ANALYTICS_FORMULA_CLOSE_REASONS,
  ANALYTICS_FORMULA_ASSIST_SOURCES,
  ANALYTICS_FORMULA_PALETTE_GROUPS,
  ANALYTICS_STAMP_SHARE_FAILURE_STAGES,
} from './analytics/events.js'
import { getKitById } from './stamps/registry.js'
import { buildStampShareUrl, clearStampFromLocation, readStampFromLocation } from './stamps/url.js'

function detectFullscreenSupport() {
  return typeof document !== 'undefined'
    && typeof Element !== 'undefined'
    && typeof document.exitFullscreen === 'function'
    && typeof Element.prototype.requestFullscreen === 'function'
}

export default {
  name: 'App',
  components: {
    DrawBoard,
    BoardLibraryModal,
    ToolsPanel,
    FormulaModal,
    ShareStampModal,
    SupportPanel,
    ZoomPanel,
  },
  setup() {
    const desktopRuntime = isDesktopRuntime()
    const boardSessionReady = ref(false)
    // Persisted presentation preferences. DrawBoard adapts objects authored with
    // the automatic board ink when boardTheme changes; explicit ink stays put.
    const { uiTheme: initialUiTheme, boardTheme: initialBoardTheme } = loadThemePreferences()
    const uiTheme = ref(initialUiTheme)
    const boardTheme = ref(initialBoardTheme)
    const selectedColor = ref(null)
    const boardThemeConfig = computed(() => BOARD_THEMES[normalizeBoardTheme(boardTheme.value)])
    const displayColor = computed(() => (
      selectedColor.value ?? boardThemeConfig.value.defaultInk
    ))
    const mainInkIsLight = computed(() => boardThemeConfig.value.inkIsLight)
    const onColorSelected = (value, options = {}) => {
      if (value === null) {
        selectedColor.value = null
        drawBoardRef.value?.recolorSelection(null, options)
        return
      }
      const normalized = normalizeHexColor(value)
      if (!normalized) return
      selectedColor.value = normalized
      drawBoardRef.value?.recolorSelection(normalized, options)
    }

    // Mirror selection ink into the palette only. Never recolor here.
    const onSelectionColor = (value) => {
      selectedColor.value = value
    }

    const selectedTool = ref('select')
    const selectedShape = ref('rectangle')
    const drawBoardRef = ref(null)
    const fullscreenRootRef = ref(null)
    const showFormulaModal = ref(false)
    const formulaModalMode = ref(ANALYTICS_FORMULA_MODES.CREATE)
    const showShareStampModal = ref(false)
    const shareStampUrl = ref('')
    const formulaPosition = ref({ x: 0, y: 0 })
    const editingLatex = ref('')
    const editingElement = ref(null)
    const zoomLevel = ref(1)
    // Web follows the Fullscreen API; desktop follows the native Tauri window.
    const isFullscreen = ref(false)
    const fullscreenSupported = ref(desktopRuntime || detectFullscreenSupport())
    const boardError = ref(null)
    const saveConflict = ref(false)
    const recoveringConflict = ref(false)
    const onPersistenceStatus = (status) => {
      saveConflict.value = status?.errorCode === 'board_conflict'
    }
    const recoverConflict = async () => {
      if (recoveringConflict.value) return
      recoveringConflict.value = true
      try {
        await drawBoardRef.value.recoverConflictedBoardAsCopy()
        boardError.value = null
      } catch (error) {
        boardError.value = error?.message || 'Could not save a recovery copy.'
      } finally {
        recoveringConflict.value = false
      }
    }
    const showBoardLibrary = ref(false)
    const boardLibraryTriggerRef = ref(null)
    const boardList = ref([])
    const archivedList = ref([])
    const boardLibraryBusy = ref(false)
    const boardLibraryLoading = ref(false)
    const boardLibraryError = ref(null)
    const closeBoardLibrary = async () => {
      if (boardLibraryBusy.value) return
      showBoardLibrary.value = false
      await nextTick()
      boardLibraryTriggerRef.value?.focus()
    }
    const boardWorkspace = () => drawBoardRef.value?.getBoardWorkspace()
    const refreshBoardLibrary = async () => {
      const workspace = boardWorkspace()
      if (!workspace) throw new Error('Board workspace is not ready.')
      const [boards, archived] = await Promise.all([workspace.list(), workspace.listArchived()])
      boardList.value = boards
      archivedList.value = archived
    }
    const openBoardLibrary = async () => {
      if (!boardSessionReady.value) return
      boardLibraryError.value = null
      boardList.value = []
      archivedList.value = []
      boardLibraryLoading.value = true
      showBoardLibrary.value = true
      try { await refreshBoardLibrary() } catch (error) { boardLibraryError.value = error.message }
      finally { boardLibraryLoading.value = false }
    }
    const onBoardLibraryAction = async ({ action, boardId, title }) => {
      if (boardLibraryBusy.value) return
      const switchedAwayFromActive = (action === 'archive' || action === 'delete')
        && boardList.value.some(board => board.id === boardId && board.isActive)
      boardLibraryError.value = null
      boardLibraryBusy.value = true
      try {
        const workspace = boardWorkspace()
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
        if (switchedAwayFromActive) selectedTool.value = 'select'
        if (switchedAwayFromActive || action === 'create' || action === 'open' || action === 'unarchive-open') {
          selectedTool.value = 'select'
          showBoardLibrary.value = false
          await nextTick()
          boardLibraryTriggerRef.value?.focus()
        }
      } catch (error) {
        boardLibraryError.value = error?.message || 'Board library operation failed.'
        // A failed post-transition metadata write may still leave a new active board.
        try { await refreshBoardLibrary() } catch { /* Preserve the original error. */ }
      } finally {
        boardLibraryBusy.value = false
      }
    }
    let fullscreenInitialized = false
    let previousFullscreen = false
    let disconnectDesktopWindow = null
    let disconnectDesktopBoardBridge = null
    let componentUnmounted = false

    const setFullscreenState = (next) => {
      isFullscreen.value = next
      if (fullscreenInitialized && next !== previousFullscreen) {
        trackEvent(next ? ANALYTICS_EVENTS.FULLSCREEN_ENTERED : ANALYTICS_EVENTS.FULLSCREEN_EXITED)
      }
      previousFullscreen = next
      fullscreenInitialized = true
      // Preserve canvas zoom and pan when either fullscreen mechanism resizes.
      nextTick(() => {
        drawBoardRef.value?.updateCanvasSize?.()
      })
    }
    const syncWebFullscreenState = () => {
      setFullscreenState(Boolean(document.fullscreenElement))
    }

    const toggleFullscreen = async () => {
      if (!fullscreenSupported.value) return
      try {
        if (desktopRuntime) {
          setFullscreenState(await toggleDesktopFullscreen())
        } else if (!document.fullscreenElement) {
          const root = fullscreenRootRef.value
          if (!root?.requestFullscreen) return
          await root.requestFullscreen()
        } else {
          await document.exitFullscreen()
        }
      } catch (err) {
        console.warn('Fullscreen request failed:', err)
        if (!desktopRuntime) syncWebFullscreenState()
      }
    }

    const waitForBoardReady = () => new Promise((resolve) => {
      const start = performance.now()
      const tick = () => {
        if (drawBoardRef.value?.canvas) {
          resolve(true)
          return
        }
        if (performance.now() - start > 5000) {
          resolve(false)
          return
        }
        requestAnimationFrame(tick)
      }
      nextTick(tick)
    })

    const trackStampShareFailure = (stage) => {
      trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_FAILED, { stage })
    }

    const bootstrapStampFromUrl = async () => {
      const payload = readStampFromLocation()
      if (!payload) return false
      try {
        const ready = await waitForBoardReady()
        if (!ready || !drawBoardRef.value) {
          trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN)
          boardError.value = 'Board is not ready to load the stamp link.'
          return false
        }
        const result = await drawBoardRef.value.bootstrapFromStamp(payload)
        if (!result?.ok) {
          trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN)
          boardError.value = result?.message || 'Could not load stamp from the link.'
          return false
        }
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_OPENED)
        selectedTool.value = 'select'
        return true
      } catch (error) {
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN)
        boardError.value = error?.message || 'Could not load stamp from the link.'
        return false
      } finally {
        clearStampFromLocation()
      }
    }

    const bootstrapLocalBoard = async () => {
      const ready = await waitForBoardReady()
      if (!ready || !drawBoardRef.value) throw new Error('Board is not ready for local storage.')
      const result = await drawBoardRef.value.bootstrapPersistence()
      if (result?.restoreFailure) {
        boardError.value = result.restoreFailure.recoverable
          ? 'MathBoard could not restore your previous board. A new local board was opened, and the previous board was kept for recovery.'
          : 'MathBoard could not find your previous local board. A new board was opened.'
      }
    }

    onMounted(async () => {
      fullscreenSupported.value = desktopRuntime || detectFullscreenSupport()
      if (desktopRuntime) {
        try {
          const disconnect = await connectDesktopWindow({
            onUndo: () => {
              if (boardSessionReady.value && !showBoardLibrary.value
                && !shouldIgnoreGlobalShortcut({ target: document.activeElement })) onUndo()
            },
            onRedo: () => {
              if (boardSessionReady.value && !showBoardLibrary.value
                && !shouldIgnoreGlobalShortcut({ target: document.activeElement })) onRedo()
            },
            onFullscreenChange: setFullscreenState,
          })
          if (componentUnmounted) disconnect()
          else disconnectDesktopWindow = disconnect
        } catch (error) {
          console.warn('Desktop window integration failed:', error)
        }
      } else {
        document.addEventListener('fullscreenchange', syncWebFullscreenState)
        syncWebFullscreenState()
      }
      try {
        const stampLoaded = await bootstrapStampFromUrl()
        if (stampLoaded) {
          // Stamp URL starts a new session: keep canvas, mint a new local board id.
          const ready = await waitForBoardReady()
          if (!ready || !drawBoardRef.value) throw new Error('Board is not ready for Stamp adoption.')
          await drawBoardRef.value.bootstrapPersistence({ adoptCurrent: true })
        } else {
          await bootstrapLocalBoard()
        }
      } catch (error) {
        console.error('Board session bootstrap failed', error)
        boardError.value = 'Local board storage is unavailable. Your changes may not be saved.'
      } finally {
        boardSessionReady.value = true
      }
      if (desktopRuntime && !componentUnmounted) {
        await nextTick()
        try {
          const { connectDesktopBoardBridge } = await import('./platform/desktopBoardBridge.js')
          const disconnect = await connectDesktopBoardBridge(() => drawBoardRef.value)
          if (componentUnmounted) disconnect()
          else disconnectDesktopBoardBridge = disconnect
        } catch (error) {
          console.warn('Desktop board bridge unavailable:', error)
        }
      }
    })

    onBeforeUnmount(() => {
      componentUnmounted = true
      if (desktopRuntime) {
        disconnectDesktopWindow?.()
        disconnectDesktopBoardBridge?.()
      } else document.removeEventListener('fullscreenchange', syncWebFullscreenState)
    })

    const onToolSelected = (tool) => {
      selectedTool.value = tool
      if (tool === 'font') {
        trackEvent(ANALYTICS_EVENTS.TEXT_TOOL_SELECTED)
      }
      if (tool === 'formula') {
        trackEvent(ANALYTICS_EVENTS.FORMULA_TOOL_SELECTED)
      }
    }

    const onShapeSelected = (shape) => {
      selectedShape.value = shape
    }

    const onCycleTheme = () => {
      const nextBoard = cycleBoardTheme(boardTheme.value)
      boardTheme.value = nextBoard
      uiTheme.value = uiThemeForBoardTheme(nextBoard)
      saveBoardTheme(nextBoard)
      saveUiTheme(uiTheme.value)
      trackEvent(ANALYTICS_EVENTS.THEME_CHANGED, { theme: nextBoard })
    }

    const closeShareStampModal = () => {
      showShareStampModal.value = false
      shareStampUrl.value = ''
    }

    const onStampShareCopied = () => {
      trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_COPIED)
    }

    const onStampShareCopyFailed = () => {
      trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.COPY)
    }

    const openShareStampLink = () => {
      boardError.value = null
      if (!drawBoardRef.value) {
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.EXPORT_SELECTION)
        return
      }
      let payload
      try {
        payload = drawBoardRef.value.exportSelectionToStamp()
      } catch (error) {
        // No selection is a silent no-op; other failures surface in English.
        if (/Nothing is selected/i.test(error?.message || '')) return
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.EXPORT_SELECTION)
        boardError.value = error?.message || 'Could not create a share link.'
        return
      }
      try {
        shareStampUrl.value = buildStampShareUrl(payload, undefined, { desktop: desktopRuntime })
        showShareStampModal.value = true
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_CREATED)
      } catch (error) {
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.BUILD_URL)
        boardError.value = error?.message || 'Could not create a share link.'
      }
    }

    const onKeyDown = (event) => {
      if (!boardSessionReady.value) return
      if (isEscapeShortcut(event)) {
        // The browser uses Escape to leave fullscreen. Do not cancel that.
        if (document.fullscreenElement) return
        if (showFormulaModal.value) {
          onFormulaModalClose(ANALYTICS_FORMULA_CLOSE_REASONS.ESCAPE)
          event.preventDefault()
          return
        }
        if (showShareStampModal.value) {
          closeShareStampModal()
          event.preventDefault()
          return
        }
        if (showBoardLibrary.value) {
          closeBoardLibrary()
          event.preventDefault()
          return
        }
        if (drawBoardRef.value?.isTextEditing()) {
          drawBoardRef.value.exitTextEditing()
          event.preventDefault()
          return
        }
        if (shouldIgnoreGlobalShortcut(event)) return
        drawBoardRef.value?.cancelTransientAction()
        event.preventDefault()
        return
      }

      if (
        showFormulaModal.value
        || showShareStampModal.value
        || showBoardLibrary.value
        || shouldIgnoreGlobalShortcut(event)
        || drawBoardRef.value?.isTextEditing()
      ) return

      const toolId = isPlainToolKey(event)
      if (toolId) {
        event.preventDefault()
        onToolSelected(toolId)
        return
      }
      const shapeId = isPlainShapeKey(event)
      if (shapeId) {
        event.preventDefault()
        onToolSelected('shapes')
        onShapeSelected(shapeId)
        return
      }
      const colorPreset = isPlainColorDigit(event)
      if (colorPreset) {
        event.preventDefault()
        onColorSelected(colorPreset.value)
        return
      }
      if (isZoomInShortcut(event)) {
        event.preventDefault()
        onZoomIn()
        return
      }
      if (isZoomOutShortcut(event)) {
        event.preventDefault()
        onZoomOut()
        return
      }
      if (isZoomResetShortcut(event)) {
        event.preventDefault()
        onResetZoom()
        return
      }
      if (isDuplicateShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.duplicateSelection()
        return
      }
      if (isSelectAllShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.selectAll()
        return
      }
      if (isDeleteShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.deleteSelection()
        return
      }
      if (isGroupShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.groupSelection()
        return
      }
      if (isUngroupShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.ungroupSelection()
        return
      }
      if (isShareStampLinkShortcut(event)) {
        event.preventDefault()
        openShareStampLink()
        return
      }
      if (isUndoShortcut(event)) {
        event.preventDefault()
        onUndo()
        return
      }
      if (isRedoShortcut(event)) {
        event.preventDefault()
        onRedo()
      }
    }

    onMounted(() => window.addEventListener('keydown', onKeyDown))
    onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

    const onUndo = () => {
      drawBoardRef.value?.undo()
    }

    const onRedo = () => {
      drawBoardRef.value?.redo()
    }

    const onInsertKit = async (kitId) => {
      boardError.value = null
      let encoded
      try {
        encoded = getKitById(kitId)
      } catch (error) {
        boardError.value = error?.message || 'Unknown kit.'
        return
      }
      const result = await drawBoardRef.value?.insertStamp(encoded)
      if (!result?.ok) {
        boardError.value = result?.message || 'Could not insert stamp.'
        return
      }
      selectedTool.value = 'select'
    }

    const onRequestFormula = (position) => {
      formulaPosition.value = position
      editingLatex.value = ''
      editingElement.value = null
      formulaModalMode.value = ANALYTICS_FORMULA_MODES.CREATE
      showFormulaModal.value = true
      trackEvent(ANALYTICS_EVENTS.FORMULA_MODAL_OPENED, {
        mode: ANALYTICS_FORMULA_MODES.CREATE,
      })
    }

    const onEditFormula = ({ latex, position, fabricObject }) => {
      formulaPosition.value = position
      editingLatex.value = latex
      // markRaw: a reactive proxy breaks Fabric identity checks in replaceFormula.
      editingElement.value = fabricObject ? markRaw(fabricObject) : null
      formulaModalMode.value = ANALYTICS_FORMULA_MODES.EDIT
      showFormulaModal.value = true
      trackEvent(ANALYTICS_EVENTS.FORMULA_MODAL_OPENED, {
        mode: ANALYTICS_FORMULA_MODES.EDIT,
      })
    }

    const onFormulaModalClose = (reason) => {
      const allowed = Object.values(ANALYTICS_FORMULA_CLOSE_REASONS)
      const closeReason = allowed.includes(reason)
        ? reason
        : ANALYTICS_FORMULA_CLOSE_REASONS.CANCEL_BUTTON
      trackEvent(ANALYTICS_EVENTS.FORMULA_MODAL_CANCELLED, {
        mode: formulaModalMode.value,
        reason: closeReason,
      })
      showFormulaModal.value = false
    }

    const onFormulaAssistUsed = ({ source, group } = {}) => {
      const allowedSources = Object.values(ANALYTICS_FORMULA_ASSIST_SOURCES)
      if (!allowedSources.includes(source)) return

      const metadata = {
        mode: formulaModalMode.value,
        source,
      }

      if (source === ANALYTICS_FORMULA_ASSIST_SOURCES.PALETTE) {
        const allowedGroups = Object.values(ANALYTICS_FORMULA_PALETTE_GROUPS)
        if (!allowedGroups.includes(group)) return
        metadata.group = group
      }

      trackEvent(ANALYTICS_EVENTS.FORMULA_ASSIST_USED, metadata)
    }

    const onTextEditingCompleted = () => {
      // Auto-switch to select tool after text editing
      selectedTool.value = 'select'
    }

    const onShapeDrawingCompleted = () => {
      // Like Text and Formula, Shapes is a one-shot creation tool.
      selectedTool.value = 'select'
    }

    const onZoomIn = () => {
      drawBoardRef.value?.zoomIn()
      updateZoomLevel()
    }

    const onZoomOut = () => {
      drawBoardRef.value?.zoomOut()
      updateZoomLevel()
    }

    const onResetZoom = () => {
      drawBoardRef.value?.resetZoom()
      zoomLevel.value = 1
    }

    const updateZoomLevel = () => {
      if (drawBoardRef.value) {
        zoomLevel.value = drawBoardRef.value.getZoom()
      }
    }

    const onInsertFormula = (formulaData) => {
      const mode = formulaModalMode.value
      trackEvent(ANALYTICS_EVENTS.FORMULA_SUBMITTED, { mode })

      if (editingElement.value) {
        // One gesture: replace the formula on the command log; do not remove first.
        // Removing here would drop the existing formula if the new render failed.
        drawBoardRef.value?.replaceFormula(editingElement.value, formulaData)
        editingElement.value = null
      } else if (drawBoardRef.value && drawBoardRef.value.addFormulaToCanvas) {
        // Add new formula
        drawBoardRef.value.addFormulaToCanvas(formulaData, formulaPosition.value);
      } else {
        console.error('drawBoardRef or addFormulaToCanvas not available');
      }
      
      showFormulaModal.value = false
      editingLatex.value = ''
      
      // Auto-switch to select tool after formula insertion
      selectedTool.value = 'select'
    }

    return {
      desktopRuntime,
      boardSessionReady,
      selectedTool,
      selectedShape,
      drawBoardRef,
      fullscreenRootRef,
      showFormulaModal,
      formulaModalMode,
      showShareStampModal,
      shareStampUrl,
      closeShareStampModal,
      onStampShareCopied,
      onStampShareCopyFailed,
      editingLatex,
      zoomLevel,
      isFullscreen,
      fullscreenSupported,
      toggleFullscreen,
      onToolSelected,
      onShapeSelected,
      onUndo,
      onRedo,
      onInsertKit,
      boardError,
      saveConflict,
      recoveringConflict,
      onPersistenceStatus,
      recoverConflict,
      showBoardLibrary,
      boardLibraryTriggerRef,
      boardList,
      archivedList,
      boardLibraryBusy,
      boardLibraryLoading,
      boardLibraryError,
      openBoardLibrary,
      closeBoardLibrary,
      onBoardLibraryAction,
      onRequestFormula,
      onEditFormula,
      onInsertFormula,
      onFormulaModalClose,
      onFormulaAssistUsed,
      onTextEditingCompleted,
      onShapeDrawingCompleted,
      onZoomIn,
      onZoomOut,
      onResetZoom,
      uiTheme,
      boardTheme,
      selectedColor,
      displayColor,
      boardThemeConfig,
      mainInkIsLight,
      onColorSelected,
      onSelectionColor,
      onCycleTheme,
    }
  }
}
</script>

<style>
body {
  margin: 0px;
  overflow: hidden;
}
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--text-primary);

  /* Dark Mode v2 semantic tokens: light defaults. Components consume these
     inherited variables and must not receive theme props. */
  --surface-primary: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
  --surface-secondary: #ffffff;
  --surface-tertiary: rgba(0, 0, 0, 0.03);
  --surface-muted: #f5f5f5;
  --text-primary: #2c3e50;
  --text-secondary: #555;
  --text-muted: #666;
  --text-placeholder: #999;
  --border-color: #e0e0e0;
  --panel-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
  --hover-bg: rgba(0, 0, 0, 0.05);
  --icon-color: #555;
  --danger: #c62828;
  --danger-hover: rgba(198, 40, 40, 0.12);
  --selected-bg: tan;
  --selected-text: rgb(61, 61, 61);
  --selected-shadow: 0 2px 8px rgba(210, 180, 140, 0.5);
  --callout-info-bg: linear-gradient(135deg, #f0f7ff 0%, #e3f0ff 100%);
  --callout-neutral-bg: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

#app[data-theme="dark"] {
  --surface-primary: linear-gradient(135deg, #2a2a2e 0%, #1e1e22 100%);
  --surface-secondary: #2a2a2e;
  --surface-tertiary: rgba(255, 255, 255, 0.06);
  --surface-muted: #1e1e22;
  --text-primary: #e0e0e0;
  --text-secondary: #bbb;
  --text-muted: #888;
  --text-placeholder: #777;
  --border-color: #444;
  --panel-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3);
  --hover-bg: rgba(255, 255, 255, 0.08);
  --icon-color: #b0b0b0;
  --danger: #ef9a9a;
  --danger-hover: rgba(239, 154, 154, 0.16);
  --selected-bg: #8b6914;
  --selected-text: #f0e6d0;
  --selected-shadow: 0 2px 8px rgba(139, 105, 20, 0.5);
  --callout-info-bg: linear-gradient(135deg, #1a2a3a 0%, #1e2e40 100%);
  --callout-neutral-bg: linear-gradient(135deg, #2a2a2e 0%, #333338 100%);
}

/* Fullscreen shell: fill the fullscreen element; do not introduce scrollbars. */
#app:fullscreen,
#app[data-fullscreen="true"] {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--surface-muted);
}

#app[data-fullscreen="true"] .secondary-chrome,
#app:fullscreen .secondary-chrome {
  display: none !important;
}

/* On desktop, keep the existing independent logo and centered board selector. */
.board-topbar { display: contents; }

.logo {
  font-family: 'Satisfy', cursive;
  font-size: normal;
  
  color: whitesmoke;
  background-color: rgb(61, 61, 61);
  border-radius: 5px;
  padding: 5px 10px ;
  border: tan 3px solid;

    position: absolute;
    z-index: 10;
    left: 12px;
    top: 12px;
    display: -ms-flexbox;
    display: flex;
    -ms-flex-direction: row;
    flex-direction: row;
    z-index: 200;
    transform: scale(1.5);
    transform-origin: top left;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 
                0 2px 4px rgba(0, 0, 0, 0.1);

}

.board-library-trigger {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(330px, calc(100vw - 350px));
  min-height: 44px;
  padding: 9px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  box-shadow: var(--panel-shadow);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.board-library-trigger:hover:not(:disabled) { box-shadow: var(--panel-shadow), inset 0 0 0 1px var(--border-color); }
.board-library-trigger:focus-visible { outline: 2px solid var(--selected-bg); outline-offset: 2px; }
.board-library-trigger-label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.board-library-trigger-label-short { display: none; }
.board-library-trigger > svg:last-child { color: var(--text-muted); font-size: 12px; }
.board-library-trigger:disabled { opacity: .6; cursor: default; }

.copyright {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--text-muted);
  font-size: 12px;
  z-index: 1000;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .copyright { display: none; }
}

.stamp-error {
  position: absolute;
  z-index: 1200;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(520px, calc(100vw - 24px));
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--surface-secondary);
  color: var(--text-primary);
  box-shadow: var(--panel-shadow);
  font-size: 14px;
  text-align: left;
}

.stamp-error button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
}

.stamp-error .save-copy-button {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  background: var(--surface-primary);
  color: var(--text-primary);
  font: inherit;
  white-space: nowrap;
}

.stamp-error .save-copy-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

@media (max-width: 768px) {
  .copyright {
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
  }
}

@media (max-width: 600px) {
  /* Fit the board selector beside the logo instead of dedicating another row. */
  .board-topbar {
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    left: max(12px, env(safe-area-inset-left));
    right: max(12px, env(safe-area-inset-right));
    z-index: 1100;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .board-topbar .logo {
    position: static;
    flex: 0 0 auto;
    transform: none;
    font-size: 24px;
    padding: 8px 15px;
    border-width: 4px;
    white-space: nowrap;
  }
  .board-library-trigger {
    position: static;
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    max-width: none;
    transform: none;
    gap: 8px;
    padding: 9px 10px;
  }
  .copyright { display: none; }
}

/* Keep the selector legible beside the logo on very narrow phones. */
@media (max-width: 360px) {
  .board-library-trigger-label-long { display: none; }
  .board-library-trigger-label-short { display: inline; }
}

.board-session-loading {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-primary);
}
</style>
