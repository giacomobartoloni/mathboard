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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<template>
  <section class="plot-parameter-panel" :style="panelStyle" :aria-label="'Parameters for graph ' + plotId"
    @pointerdown.stop @mousedown.stop @touchstart.stop @click.stop @wheel.stop @keydown.stop>
    <strong>Parameters</strong>
    <div v-for="parameter in parameters" :key="parameter.symbol" class="parameter">
      <label :for="plotId + '-' + parameter.symbol">
        <span>{{ parameter.symbol }}</span>
        <output>{{ valueFor(parameter) }}</output>
      </label>
      <input :id="plotId + '-' + parameter.symbol" type="range"
        :min="parameter.min" :max="parameter.max" :step="parameter.step"
        :value="valueFor(parameter)" :aria-label="'Parameter ' + parameter.symbol"
        @input="onInput(parameter, $event)" @change="onChange(parameter, $event)"
        @keydown.esc.prevent="cancel(parameter)" />
    </div>
  </section>
</template>

<script>
export default {
  name: 'PlotParameterPanel',
  props: {
    plotId: { type: String, required: true },
    parameters: { type: Array, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    maxHeight: { type: Number, required: true }
  },
  emits: ['preview', 'commit', 'cancel'],
  data() { return { draft: {} } },
  computed: {
    panelStyle() {
      return { left: this.x + 'px', top: this.y + 'px', maxHeight: this.maxHeight + 'px' }
    }
  },
  methods: {
    valueFor(parameter) {
      return this.draft[parameter.symbol] ?? parameter.value
    },
    onInput(parameter, event) {
      const value = Number(event.target.value)
      if (!Number.isFinite(value)) return
      this.draft[parameter.symbol] = value
      this.$emit('preview', { id: this.plotId, symbol: parameter.symbol, value })
    },
    onChange(parameter, event) {
      const value = Number(event.target.value)
      if (!Number.isFinite(value)) return
      this.$emit('commit', { id: this.plotId, symbol: parameter.symbol, value })
      delete this.draft[parameter.symbol]
    },
    cancel(parameter) {
      delete this.draft[parameter.symbol]
      this.$emit('cancel', { id: this.plotId })
    }
  }
}
</script>

<style scoped>
.plot-parameter-panel {
  position: absolute;
  width: min(250px, calc(100% - 16px));
  box-sizing: border-box;
  overflow-y: auto;
  pointer-events: auto;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-secondary);
  color: var(--text-primary);
  box-shadow: var(--panel-shadow);
}
.plot-parameter-panel strong { display: block; margin-bottom: 8px; font-size: 13px; }
.parameter { margin-bottom: 8px; }
.parameter:last-child { margin-bottom: 0; }
.parameter label { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
.parameter output { font-variant-numeric: tabular-nums; }
.parameter input { width: 100%; min-height: 28px; accent-color: var(--text-primary); }
.parameter input:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
</style>
