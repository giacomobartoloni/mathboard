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
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <div :inert="!boardSessionReady">
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
        @selection-color="onSelectionColor"
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
        @undo="onUndo"
        @redo="onRedo"
        @insert-kit="onInsertKit"
      />

    </div>
    <div v-if="!boardSessionReady" class="board-session-loading" role="status" aria-label="Loading board">Loading board…</div>

    <div v-if="stampError" class="stamp-error" role="alert">
      <span>{{ stampError }}</span>
      <button type="button" @click="stampError = null" aria-label="Dismiss">×</button>
    </div>
    
    <FormulaModal 
      :isVisible="showFormulaModal"
      :initialLatex="editingLatex"
      :mode="formulaModalMode"
      @close="onFormulaModalClose"
      @insert-formula="onInsertFormula"
      @assist-used="onFormulaAssistUsed"
    />

    <ShareStampModal
      :isVisible="showShareStampModal"
      :url="shareStampUrl"
      @close="closeShareStampModal"
      @copied="onStampShareCopied"
      @copy-failed="onStampShareCopyFailed"
    />
    
    <ZoomPanel 
      :zoomLevel="zoomLevel"
      :board-theme="boardTheme"
      :is-fullscreen="isFullscreen"
      :fullscreen-supported="fullscreenSupported"
      @zoom-in="onZoomIn"
      @zoom-out="onZoomOut"
      @reset-zoom="onResetZoom"
      @cycle-theme="onCycleTheme"
      @toggle-fullscreen="toggleFullscreen"
    />
    
    <SupportPanel class="secondary-chrome" />
    
    <CookieBanner v-show="!isFullscreen" />
    
    <span class="copyright secondary-chrome">© 2026 MathBoard.app • Made with <font-awesome-icon :icon="['fas', 'heart']" /> in Florence • All Rights Reserved</span>
  </div>
</template>

<script>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import DrawBoard from './components/DrawBoard.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import FormulaModal from './components/FormulaModal.vue'
import ShareStampModal from './components/ShareStampModal.vue'
import SupportPanel from './components/SupportPanel.vue'
import ZoomPanel from './components/ZoomPanel.vue'
import CookieBanner from './components/CookieBanner.vue'
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
    ToolsPanel,
    FormulaModal,
    ShareStampModal,
    SupportPanel,
    ZoomPanel,
    CookieBanner,
  },
  setup() {
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
    // Mirror of document.fullscreenElement only — never invent a parallel flag.
    const isFullscreen = ref(false)
    const fullscreenSupported = ref(detectFullscreenSupport())
    const stampError = ref(null)
    let fullscreenInitialized = false
    let previousFullscreen = false

    const syncFullscreenState = () => {
      const next = Boolean(document.fullscreenElement)
      isFullscreen.value = next
      if (fullscreenInitialized && next !== previousFullscreen) {
        trackEvent(next ? ANALYTICS_EVENTS.FULLSCREEN_ENTERED : ANALYTICS_EVENTS.FULLSCREEN_EXITED)
      }
      previousFullscreen = next
      fullscreenInitialized = true
      // Fullscreen changes layout size; reuse DrawBoard's existing resize path
      // so viewportTransform / zoom / pan stay intact.
      nextTick(() => {
        drawBoardRef.value?.updateCanvasSize?.()
      })
    }

    const toggleFullscreen = async () => {
      if (!fullscreenSupported.value) return
      try {
        if (!document.fullscreenElement) {
          const root = fullscreenRootRef.value
          if (!root?.requestFullscreen) return
          await root.requestFullscreen()
        } else {
          await document.exitFullscreen()
        }
      } catch (err) {
        // Policy rejection / unsupported — keep the app usable.
        console.warn('Fullscreen request failed:', err)
        syncFullscreenState()
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
          stampError.value = 'Board is not ready to load the stamp link.'
          return false
        }
        const result = await drawBoardRef.value.bootstrapFromStamp(payload)
        if (!result?.ok) {
          trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN)
          stampError.value = result?.message || 'Could not load stamp from the link.'
          return false
        }
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_OPENED)
        selectedTool.value = 'select'
        return true
      } catch (error) {
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.OPEN)
        stampError.value = error?.message || 'Could not load stamp from the link.'
        return false
      } finally {
        clearStampFromLocation()
      }
    }

    const bootstrapLocalBoard = async () => {
      const ready = await waitForBoardReady()
      if (!ready || !drawBoardRef.value) throw new Error('Board is not ready for local storage.')
      try {
        const result = await drawBoardRef.value.bootstrapPersistence()
        if (result?.restoreFailure) {
          stampError.value = result.restoreFailure.recoverable
            ? 'MathBoard could not restore your previous board. A new local board was opened, and the previous board was kept for recovery.'
            : 'MathBoard could not find your previous local board. A new board was opened.'
        }
      } catch (error) {
        console.error('Local board restore failed', error)
        stampError.value = 'Local board storage is unavailable. Your changes may not be saved.'
      }
    }

    onMounted(async () => {
      fullscreenSupported.value = detectFullscreenSupport()
      document.addEventListener('fullscreenchange', syncFullscreenState)
      syncFullscreenState()
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
        stampError.value = 'Local board storage is unavailable. Your changes may not be saved.'
      } finally {
        boardSessionReady.value = true
      }
    })

    onBeforeUnmount(() => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
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
      stampError.value = null
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
        stampError.value = error?.message || 'Could not create a share link.'
        return
      }
      try {
        shareStampUrl.value = buildStampShareUrl(payload)
        showShareStampModal.value = true
        trackEvent(ANALYTICS_EVENTS.STAMP_SHARE_CREATED)
      } catch (error) {
        trackStampShareFailure(ANALYTICS_STAMP_SHARE_FAILURE_STAGES.BUILD_URL)
        stampError.value = error?.message || 'Could not create a share link.'
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
      stampError.value = null
      let encoded
      try {
        encoded = getKitById(kitId)
      } catch (error) {
        stampError.value = error?.message || 'Unknown kit.'
        return
      }
      const result = await drawBoardRef.value?.insertStamp(encoded)
      if (!result?.ok) {
        stampError.value = result?.message || 'Could not insert stamp.'
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
      stampError,
      onRequestFormula,
      onEditFormula,
      onInsertFormula,
      onFormulaModalClose,
      onFormulaAssistUsed,
      onTextEditingCompleted,
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

/* Support panel is hidden in fullscreen; reclaim its bottom-right space. */
#app[data-fullscreen="true"] .zoom-panel,
#app:fullscreen .zoom-panel {
  right: 12px;
}

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

.copyright {
  position: absolute;
  bottom: 12px;
  left: 12px;
  color: var(--text-muted);
  font-size: 12px;
  z-index: 1000;
  white-space: nowrap;
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

@media (max-width: 768px) {
  .copyright {
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
  }
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
