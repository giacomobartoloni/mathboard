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
  <div>
    <div class="tools-panel">
      <!--     <img alt="Vue logo" src="../assets/logo.png" width="30px" /> -->
      <div :class="{ selected: selected === 'select' }" @click="select('select')" title="Select">
        <font-awesome-icon :icon="['fas', 'mouse-pointer']" />
      </div>
      <div :class="{ selected: selected === 'pan' }" @click="select('pan')" title="Pan">
        <font-awesome-icon :icon="['far', 'hand-paper']" />
      </div>
      <div :class="{ selected: selected === 'pencil' }" @click="select('pencil')" title="Pencil">
        <font-awesome-icon :icon="['fas', 'pencil-alt']" />
      </div>
      <div :class="{ selected: selected === 'font' }" @click="select('font')" title="Text">
        <font-awesome-icon :icon="['fas', 'font']" />
      </div>
      <div :class="{ selected: selected === 'formula' }" @click="select('formula')" title="Formula">
        <font-awesome-icon :icon="['fas', 'square-root-alt']" />
      </div>
      <div 
        :class="{ selected: selected === 'shapes' }" 
        @click="select('shapes')"
        @mouseenter="showShapesSubmenu = true"
        @mouseleave="showShapesSubmenu = false"
        title="Shapes"
      >
        <font-awesome-icon :icon="['fas', 'shapes']" />
        
        <!-- Submenu per le forme -->
        <transition name="fade">
          <div v-if="showShapesSubmenu && selected === 'shapes'" class="shapes-submenu" @click.stop>
            <div 
              :class="{ 'selected-shape': selectedShape === 'rectangle' }"
              @click="selectShape('rectangle')"
              title="Rectangle"
            >
              <font-awesome-icon :icon="['far', 'square']" />
            </div>
            <div 
              :class="{ 'selected-shape': selectedShape === 'circle' }"
              @click="selectShape('circle')"
              title="Circle"
            >
              <font-awesome-icon :icon="['far', 'circle']" />
            </div>
            <div 
              :class="{ 'selected-shape': selectedShape === 'arrow' }"
              @click="selectShape('arrow')"
              class="line-icon"
              title="Line"
            >
              |
            </div>
          </div>
        </transition>
      </div>
    </div>
    
    <div class="history-panel">
      <div @click="$emit('undo')" title="Undo (Ctrl+Z)">
        <font-awesome-icon :icon="['fas', 'undo']" />
      </div>
      <div @click="$emit('redo')" title="Redo (Ctrl+Y)">
        <font-awesome-icon :icon="['fas', 'redo']" />
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "ToolsPanel",
  props: {
    selectedTool: {
      type: String,
      default: 'select'
    }
  },
  data() {
    return {
      selected: "select",
      selectedShape: "rectangle",
      showShapesSubmenu: false,
      pencil: {
        width: 10,
        color: "(187, 187, 187)",
      },
      pan: {
      },
      text: {
      },
    };
  },
  methods: {
    select: function (element) {
      this.selected = element;
      this.$emit('tool-selected', element);
      if (element === 'shapes') {
        this.$emit('shape-selected', this.selectedShape);
      }
    },
    selectShape: function (shape) {
      this.selectedShape = shape;
      this.$emit('shape-selected', shape);
    }
  },
  watch: {
    selectedTool(newTool) {
      this.selected = newTool;
    }
  }
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.tools-panel {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: max(15vh, 100px);

  background: var(--panel-bg);
  color: var(--panel-color);
  border-radius: 8px;
  padding: 8px 6px;
  border: none;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tools-panel > div {
  padding: 8px 12px;
  border-radius: 6px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--panel-icon-color);
}

.tools-panel > div:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
}

.tools-panel > div.selected {
  background-color: var(--panel-selected-bg);
  color: var(--panel-selected-color);
  box-shadow: var(--panel-selected-shadow);
}

.history-panel {
  position: absolute;
  z-index: 10;
  left: 12px;
  top: calc(max(15vh, 100px) + 300px);

  background: var(--panel-bg);
  color: var(--panel-color);
  border-radius: 8px;
  padding: 8px 6px;
  border: none;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-panel > div {
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--panel-icon-color);
}

.history-panel > div:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
}

.shapes-submenu {
  position: absolute;
  left: 100%;
  top: -2px;
  margin-left: 10px;
  background: var(--panel-bg);
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  padding: 6px 4px;
  white-space: nowrap;
  box-shadow: var(--panel-shadow);
}

.shapes-submenu > div {
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--panel-icon-color);
}

.shapes-submenu > div:hover {
  background-color: var(--panel-hover-bg);
  transform: translateY(-1px);
}

.shapes-submenu > div.selected-shape {
  background-color: var(--panel-selected-bg);
  color: var(--panel-selected-color);
  box-shadow: 0 2px 6px rgba(210, 180, 140, 0.5);
}

.shapes-submenu > div.line-icon {
  font-size: 15px;
  font-weight: bold;
  width: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
