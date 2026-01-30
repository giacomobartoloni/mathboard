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
  <div id="app">
    <span class="logo">MathBoard</span>

    <!-- <img alt="Vue logo" src="./assets/logo.png"> -->
    <DrawBoard 
      :id="'board'" 
      :selectedTool="selectedTool" 
      :selectedShape="selectedShape" 
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
      @zoom-in="onZoomIn"
      @zoom-out="onZoomOut"
      @reset-zoom="onResetZoom"
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
  color: #666;
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
