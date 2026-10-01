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
    :data-theme="uiTheme"
    :data-fullscreen="isFullscreen ? 'true' : 'false'"
  >
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <DrawBoard 
      :id="'board'" 
      :selectedTool="selectedTool" 
      :selectedShape="selectedShape" 
      :board-theme="boardTheme"
      :selected-color="selectedColor"
      :selection-panel-suspended="showFormulaModal"
      ref="drawBoardRef"
      @request-formula="onRequestFormula"
      @edit-formula="onEditFormula"
      @text-editing-completed="onTextEditingCompleted"
      @selection-color="onSelectionColor"
    />
    <ToolsPanel :selectedTool="selectedTool" :selected-color="selectedColor" :display-color="displayColor" :main-color="boardThemeConfig.defaultInk" :main-ink-is-light="mainInkIsLight" @tool-selected="onToolSelected" @shape-selected="onShapeSelected" @color-selected="onColorSelected" @undo="onUndo" @redo="onRedo" />
    
    <FormulaModal 
      :isVisible="showFormulaModal"
      :initialLatex="editingLatex"
      @close="showFormulaModal = false"
      @insert-formula="onInsertFormula"
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
    
    <CookieBanner v-if="!desktopRuntime" v-show="!isFullscreen" />
    
    <span class="copyright secondary-chrome">© 2026 MathBoard.app • Made with <font-awesome-icon :icon="['fas', 'heart']" /> in Florence • All Rights Reserved</span>
  </div>
</template>

<script>
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import DrawBoard from './components/DrawBoard.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import FormulaModal from './components/FormulaModal.vue'
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
  isEscapeShortcut,
  isPlainToolKey,
  isRedoShortcut,
  isUndoShortcut,
  shouldIgnoreGlobalShortcut,
} from './config/shortcuts'
import { isDesktopRuntime } from './platform/runtime'
import { trackEvent } from './analytics'
import { ANALYTICS_EVENTS } from './analytics/events.js'

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
    SupportPanel,
    ZoomPanel,
    CookieBanner,
  },
  setup() {
    const desktopRuntime = isDesktopRuntime()

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
    const formulaPosition = ref({ x: 0, y: 0 })
    const editingLatex = ref('')
    const editingElement = ref(null)
    const zoomLevel = ref(1)
    // Mirror of document.fullscreenElement only — never invent a parallel flag.
    const isFullscreen = ref(false)
    const fullscreenSupported = ref(detectFullscreenSupport())
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

    onMounted(() => {
      fullscreenSupported.value = detectFullscreenSupport()
      document.addEventListener('fullscreenchange', syncFullscreenState)
      syncFullscreenState()
    })

    onBeforeUnmount(() => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    })

    const onToolSelected = (tool) => {
      selectedTool.value = tool
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

    const onKeyDown = (event) => {
      if (isEscapeShortcut(event)) {
        // The browser uses Escape to leave fullscreen. Do not cancel that.
        if (document.fullscreenElement) return
        if (showFormulaModal.value) {
          showFormulaModal.value = false
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

      if (showFormulaModal.value || shouldIgnoreGlobalShortcut(event) || drawBoardRef.value?.isTextEditing()) return

      const toolId = isPlainToolKey(event)
      if (toolId) {
        event.preventDefault()
        onToolSelected(toolId)
        return
      }
      if (isDeleteShortcut(event)) {
        event.preventDefault()
        drawBoardRef.value?.deleteSelection()
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

    const onRequestFormula = (position) => {
      formulaPosition.value = position
      editingLatex.value = ''
      editingElement.value = null
      showFormulaModal.value = true
    }

    const onEditFormula = ({ latex, position, fabricObject }) => {
      formulaPosition.value = position
      editingLatex.value = latex
      editingElement.value = fabricObject
      showFormulaModal.value = true
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
      if (editingElement.value) {
        // One gesture: swap the bitmap on the command log, do not remove first.
        // Removing here used to drop the formula if the new bitmap failed.
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
      selectedTool,
      selectedShape,
      drawBoardRef,
      fullscreenRootRef,
      desktopRuntime,
      showFormulaModal,
      editingLatex,
      zoomLevel,
      isFullscreen,
      fullscreenSupported,
      toggleFullscreen,
      onToolSelected,
      onShapeSelected,
      onUndo,
      onRedo,
      onRequestFormula,
      onEditFormula,
      onInsertFormula,
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

@media (max-width: 768px) {
  .copyright {
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
