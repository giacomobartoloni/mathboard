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
  <div id="app" :data-theme="uiTheme">
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <DrawBoard 
      :id="'board'" 
      :selectedTool="selectedTool" 
      :selectedShape="selectedShape" 
      :board-theme="boardTheme"
      ref="drawBoardRef"
      @request-formula="onRequestFormula"
      @edit-formula="onEditFormula"
      @text-editing-completed="onTextEditingCompleted"
    />
    <ToolsPanel :selectedTool="selectedTool" @tool-selected="onToolSelected" @shape-selected="onShapeSelected" @undo="onUndo" @redo="onRedo" />
    
    <FormulaModal 
      :isVisible="showFormulaModal"
      :initialLatex="editingLatex"
      @close="showFormulaModal = false"
      @insert-formula="onInsertFormula"
    />
    
    <ZoomPanel 
      :zoomLevel="zoomLevel"
      :board-theme="boardTheme"
      @zoom-in="onZoomIn"
      @zoom-out="onZoomOut"
      @reset-zoom="onResetZoom"
      @cycle-theme="onCycleTheme"
    />
    
    <SupportPanel />
    
    <CookieBanner />
    
    <span class="copyright">© 2026 MathBoard.app • Made with <font-awesome-icon :icon="['fas', 'heart']" /> in Florence • All Rights Reserved</span>
  </div>
</template>

<script>
import { onMounted, onUnmounted, ref } from 'vue'
import DrawBoard from './components/DrawBoard.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import FormulaModal from './components/FormulaModal.vue'
import SupportPanel from './components/SupportPanel.vue'
import ZoomPanel from './components/ZoomPanel.vue'
import CookieBanner from './components/CookieBanner.vue'
import {
  loadThemePreferences,
  saveUiTheme,
  saveBoardTheme,
  cycleBoardTheme,
  uiThemeForBoardTheme,
} from './config/themes'
import {
  isDeleteShortcut,
  isEscapeShortcut,
  isPlainToolKey,
  isRedoShortcut,
  isUndoShortcut,
  shouldIgnoreGlobalShortcut,
} from './config/shortcuts'

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
    // Persisted presentation preferences. DrawBoard adapts objects authored with
    // the automatic board ink when boardTheme changes; explicit ink stays put.
    const { uiTheme: initialUiTheme, boardTheme: initialBoardTheme } = loadThemePreferences()
    const uiTheme = ref(initialUiTheme)
    const boardTheme = ref(initialBoardTheme)

    const selectedTool = ref('select')
    const selectedShape = ref('rectangle')
    const drawBoardRef = ref(null)
    const showFormulaModal = ref(false)
    const formulaPosition = ref({ x: 0, y: 0 })
    const editingLatex = ref('')
    const editingElement = ref(null)
    const zoomLevel = ref(1)

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
    }

    const onKeyDown = (event) => {
      if (isEscapeShortcut(event)) {
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

      if (shouldIgnoreGlobalShortcut(event) || drawBoardRef.value?.isTextEditing()) return

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
        // Update existing formula - remove old and add new
        const canvas = drawBoardRef.value?.canvas
        if (canvas && editingElement.value) {
          const oldPos = {
            x: editingElement.value.left,
            y: editingElement.value.top
          }
          canvas.remove(editingElement.value)
          drawBoardRef.value.addFormulaToCanvas(formulaData, oldPos)
        }
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
      showFormulaModal,
      editingLatex,
      zoomLevel,
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
  --selected-bg: #8b6914;
  --selected-text: #f0e6d0;
  --selected-shadow: 0 2px 8px rgba(139, 105, 20, 0.5);
  --callout-info-bg: linear-gradient(135deg, #1a2a3a 0%, #1e2e40 100%);
  --callout-neutral-bg: linear-gradient(135deg, #2a2a2e 0%, #333338 100%);
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

[You have received this identical output 3 times. Re-reading '/Users/gbartoloni/projects/learning/mathboard/src/App.vue:raw' will not change it — use a narrower selector (path:A-B), or proceed with the edit.]

[Showing lines 1-300 of 317. Use :301 to continue]