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
  <div id="app" :class="{ 'dark-mode': isDarkMode }">
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <DrawBoard 
      :id="'board'" 
      :selectedTool="selectedTool" 
      :selectedShape="selectedShape" 
      :isDarkMode="isDarkMode"
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
      :isDarkMode="isDarkMode"
      @zoom-in="onZoomIn"
      @zoom-out="onZoomOut"
      @reset-zoom="onResetZoom"
      @toggle-dark-mode="onToggleDarkMode"
    />
    
    <SupportPanel />
    
    <CookieBanner />
    
    <span class="copyright">© 2026 MathBoard.app • Made with <font-awesome-icon :icon="['fas', 'heart']" /> in Florence • All Rights Reserved</span>
  </div>
</template>

<script>
import { ref } from 'vue'
import DrawBoard from './components/DrawBoard.vue'
import ToolsPanel from './components/ToolsPanel.vue'
import FormulaModal from './components/FormulaModal.vue'
import SupportPanel from './components/SupportPanel.vue'
import ZoomPanel from './components/ZoomPanel.vue'
import CookieBanner from './components/CookieBanner.vue'

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
    const selectedTool = ref('select')
    const selectedShape = ref('rectangle')
    const drawBoardRef = ref(null)
    const showFormulaModal = ref(false)
    const formulaPosition = ref({ x: 0, y: 0 })
    const editingLatex = ref('')
    const editingElement = ref(null)
    const zoomLevel = ref(1)
    const isDarkMode = ref(localStorage.getItem('mathboard_dark_mode') === 'true')

    const onToggleDarkMode = () => {
      isDarkMode.value = !isDarkMode.value
      localStorage.setItem('mathboard_dark_mode', isDarkMode.value)
    }

    const onToolSelected = (tool) => {
      selectedTool.value = tool
    }

    const onShapeSelected = (shape) => {
      selectedShape.value = shape
    }

    const onUndo = () => {
      drawBoardRef.value?.undo()
    }

    const onRedo = () => {
      drawBoardRef.value?.redo()
    }

    const onRequestFormula = (position) => {
      console.log('onRequestFormula called:', position);
      formulaPosition.value = position
      editingLatex.value = ''
      editingElement.value = null
      showFormulaModal.value = true
    }

    const onEditFormula = ({ latex, position, fabricObject }) => {
      console.log('onEditFormula called:', latex, position);
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
      console.log('onInsertFormula called:', formulaData, formulaPosition.value);
      console.log('drawBoardRef.value:', drawBoardRef.value);
      
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
      isDarkMode,
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
      onToggleDarkMode,
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
  color: #2c3e50;

  /* Light mode (default) CSS variables */
  --panel-bg: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
  --panel-color: #3d3d3d;
  --panel-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
  --panel-icon-color: #555;
  --panel-hover-bg: rgba(0, 0, 0, 0.05);
  --panel-selected-bg: tan;
  --panel-selected-color: rgb(61, 61, 61);
  --panel-selected-shadow: 0 2px 8px rgba(210, 180, 140, 0.5);
  --zoom-level-bg: rgba(0, 0, 0, 0.03);
  --zoom-level-color: #666;
  --zoom-reset-color: #333;
  --modal-bg: white;
  --modal-text: #333;
  --modal-border: #e0e0e0;
  --modal-input-bg: white;
  --modal-label-color: #555;
  --modal-preview-bg: #fafafa;
  --modal-placeholder-color: #999;
  --modal-example-bg: #f5f5f5;
  --modal-example-border: #ddd;
  --modal-example-color: #555;
  --copyright-color: #666;
  --cookie-bg: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  --cookie-border-top: #2c3e50;
  --cookie-text: #555;
  --cookie-heading: #2c3e50;
  --cookie-details-bg: rgba(0, 0, 0, 0.03);
  --about-modal-bg: white;
  --about-text-color: #333;
  --about-section-bg: linear-gradient(135deg, #f0f7ff 0%, #e3f0ff 100%);
  --feedback-section-bg: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  --contact-link-bg: white;
  --contact-link-border: #dee2e6;
  --close-btn-color: #666;
  --close-btn-hover-bg: rgba(0, 0, 0, 0.1);
  --separator-color: #e0e0e0;
}

#app.dark-mode {
  color: #e0e0e0;

  --panel-bg: linear-gradient(135deg, #2a2a2e 0%, #1e1e22 100%);
  --panel-color: #e0e0e0;
  --panel-shadow: 0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3);
  --panel-icon-color: #b0b0b0;
  --panel-hover-bg: rgba(255, 255, 255, 0.08);
  --panel-selected-bg: #8b6914;
  --panel-selected-color: #f0e6d0;
  --panel-selected-shadow: 0 2px 8px rgba(139, 105, 20, 0.5);
  --zoom-level-bg: rgba(255, 255, 255, 0.06);
  --zoom-level-color: #aaa;
  --zoom-reset-color: #ccc;
  --modal-bg: #2a2a2e;
  --modal-text: #e0e0e0;
  --modal-border: #444;
  --modal-input-bg: #1e1e22;
  --modal-label-color: #bbb;
  --modal-preview-bg: #1e1e22;
  --modal-placeholder-color: #777;
  --modal-example-bg: #333;
  --modal-example-border: #555;
  --modal-example-color: #ccc;
  --copyright-color: #888;
  --cookie-bg: linear-gradient(135deg, #2a2a2e 0%, #1e1e22 100%);
  --cookie-border-top: #8b6914;
  --cookie-text: #bbb;
  --cookie-heading: #e0e0e0;
  --cookie-details-bg: rgba(255, 255, 255, 0.05);
  --about-modal-bg: #2a2a2e;
  --about-text-color: #ccc;
  --about-section-bg: linear-gradient(135deg, #1a2a3a 0%, #1e2e40 100%);
  --feedback-section-bg: linear-gradient(135deg, #2a2a2e 0%, #333338 100%);
  --contact-link-bg: #333;
  --contact-link-border: #555;
  --close-btn-color: #aaa;
  --close-btn-hover-bg: rgba(255, 255, 255, 0.1);
  --separator-color: #444;
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
  color: var(--copyright-color);
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
