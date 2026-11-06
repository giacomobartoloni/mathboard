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
    class="plot-overlay"
    @click.self="close"
    @keydown.esc.stop.prevent="close"
    @keydown.tab="trapTab"
  >
    <section
      ref="dialog"
      class="plot-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plot-heading"
      :aria-busy="busy"
      tabindex="-1"
    >
      <header>
        <h2 id="plot-heading">{{ initialSpec ? 'Edit graph' : 'Create graph' }}</h2>
        <button
          type="button"
          class="plot-close"
          aria-label="Close graph editor"
          :disabled="busy"
          @click="close"
        >
          ×
        </button>
      </header>
      <form @submit.prevent="submit">
        <div class="plot-body">
          <div class="plot-controls">
            <label for="plot-function">Function (LaTeX)</label>
            <textarea
              id="plot-function"
              ref="functionInput"
              v-model="form.latex"
              rows="2"
              maxlength="2048"
              spellcheck="false"
              :disabled="busy"
              aria-describedby="plot-function-help"
              @keydown.ctrl.enter.prevent="submit"
              @keydown.meta.enter.prevent="submit"
            ></textarea>
            <p id="plot-function-help" class="plot-help">
              A real function of x. Try x^2, \frac{1}{x}, or \sin(x). Angles use radians.
            </p>
            <div class="plot-formula" aria-hidden="true" v-html="formulaHtml"></div>
            <fieldset :disabled="busy">
              <legend>Axis ranges</legend>
              <div class="plot-ranges">
                <label v-for="[key, label] in bounds" :key="key"
                  >{{ label }}
                  <input
                    v-model.number="form.mathWindow[key]"
                    type="number"
                    step="any"
                    :aria-label="label"
                    required
                  />
                </label>
              </div>
            </fieldset>
            <div class="plot-options">
              <label><input v-model="form.axes" type="checkbox" :disabled="busy" /> Axes</label>
              <label><input v-model="form.grid" type="checkbox" :disabled="busy" /> Grid</label>
              <label
                >Curve color
                <select v-model="form.color" :disabled="busy">
                  <option value="auto">Board ink</option>
                  <option value="#2563eb">Blue</option>
                  <option value="#dc2626">Red</option>
                  <option value="#16a34a">Green</option>
                  <option value="#9333ea">Purple</option>
                </select></label
              >
            </div>
          </div>
          <div class="plot-preview-section">
            <span class="plot-preview-label">Preview</span>
            <div
              class="plot-preview"
              :style="{ aspectRatio: form.frame.width + '/' + form.frame.height }"
            >
              <svg
                v-if="preview"
                :viewBox="'0 0 ' + form.frame.width + ' ' + form.frame.height"
                role="img"
                :aria-label="'Graph of ' + form.latex"
              >
                <path
                  v-for="(d, i) in preview.grid"
                  :key="'g' + i"
                  :d="d"
                  fill="none"
                  stroke="currentColor"
                  opacity="0.14"
                />
                <path
                  v-for="(d, i) in preview.axes"
                  :key="'a' + i"
                  :d="d"
                  fill="none"
                  stroke="currentColor"
                  opacity="0.65"
                />
                <path
                  v-for="(d, i) in preview.curves"
                  :key="'c' + i"
                  :d="d"
                  fill="none"
                  :stroke="form.color === 'auto' ? 'currentColor' : form.color"
                  stroke-width="2"
                />
                <circle
                  v-for="(dot, i) in preview.dots"
                  :key="'d' + i"
                  :cx="dot.x"
                  :cy="dot.y"
                  r="1.7"
                  :fill="form.color === 'auto' ? 'currentColor' : form.color"
                />
                <text
                  v-for="(label, i) in preview.labels"
                  :key="'l' + i"
                  :x="label.x"
                  :y="label.y"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  fill="currentColor"
                  font-size="11"
                >
                  {{ label.text }}
                </text>
              </svg>
              <span v-else class="plot-placeholder">{{
                calculating ? 'Calculating graph…' : 'Your graph preview appears here.'
              }}</span>
            </div>
            <p v-if="preview" class="plot-help">
              {{
                preview.isotropic ? 'Equal units on both axes.' : 'Axes use different scales.'
              }}
              Board zoom keeps these ranges.
            </p>
            <p v-if="preview?.status === 'partial'" class="plot-help" role="status">
              Some intervals could not be resolved and are shown as gaps.
            </p>
            <p
              v-if="preview && !preview.curves.length && !preview.dots.length"
              class="plot-help"
              role="status"
            >
              The curve is outside the visible Y range. Adjust the axis ranges.
            </p>
            <p v-if="error || commitError" class="plot-error" role="alert">
              {{ error || commitError }}
            </p>
            <p class="plot-help">
              One editable graph. Double-click it on the board to change the function or ranges.
            </p>
          </div>
        </div>
        <footer>
          <button type="button" :disabled="busy" @click="close">Cancel</button>
          <button
            type="submit"
            class="plot-submit"
            :disabled="busy || calculating || !preview || !!error"
          >
            {{ busy ? 'Saving graph…' : initialSpec ? 'Update graph' : 'Insert graph' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script>
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { DEFAULT_PLOT } from '../plots/plotSpec.js'
import { computePlotAsync } from '../plots/PlotComputation.js'

export default {
  name: 'PlotModal',
  props: {
    initialSpec: { type: Object, default: null },
    busy: Boolean,
    commitError: { type: String, default: '' }
  },
  emits: ['close', 'submit-plot'],
  data() {
    return {
      form: JSON.parse(JSON.stringify({ ...DEFAULT_PLOT, color: 'auto', ...this.initialSpec })),
      preview: null,
      error: '',
      calculating: true,
      bounds: [
        ['xMin', 'X minimum'],
        ['xMax', 'X maximum'],
        ['yMin', 'Y minimum'],
        ['yMax', 'Y maximum']
      ]
    }
  },
  computed: {
    formulaHtml() {
      try {
        return katex.renderToString(this.form.latex, {
          throwOnError: false,
          trust: false,
          maxExpand: 100,
          maxSize: 20
        })
      } catch {
        return ''
      }
    }
  },
  watch: {
    form: {
      deep: true,
      handler() {
        this.schedulePreview()
      }
    }
  },
  mounted() {
    this.$refs.functionInput.focus()
    this.schedulePreview()
  },
  beforeUnmount() {
    this._closed = true
    clearTimeout(this._previewTimer)
    this._previewAbort?.abort()
  },
  methods: {
    snapshot() {
      return JSON.parse(JSON.stringify(this.form))
    },
    schedulePreview() {
      clearTimeout(this._previewTimer)
      this._previewAbort?.abort()
      this.preview = null
      this.error = ''
      this.calculating = true
      this._previewTimer = setTimeout(() => this.calculate(), 200)
    },
    async calculate() {
      const abort = new AbortController()
      this._previewAbort = abort
      try {
        const preview = await computePlotAsync(this.snapshot(), { signal: abort.signal })
        if (!abort.signal.aborted && !this._closed) this.preview = preview
      } catch (error) {
        if (!abort.signal.aborted && !this._closed) this.error = error.message
      } finally {
        if (!abort.signal.aborted && !this._closed) this.calculating = false
      }
    },
    submit() {
      if (!this.busy && !this.calculating && this.preview && !this.error)
        this.$emit('submit-plot', this.snapshot())
    },
    close() {
      if (!this.busy) this.$emit('close')
    },
    trapTab(event) {
      const nodes = [...this.$refs.dialog.querySelectorAll('button,input,textarea,select')].filter(
        (n) => !n.disabled && n.offsetParent !== null
      )
      const first = nodes[0],
        last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }
}
</script>

<style scoped>
.plot-overlay {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.48);
}
.plot-dialog {
  width: min(940px, 100%);
  max-height: calc(100dvh - 48px);
  overflow: auto;
  background: var(--surface-secondary);
  color: var(--text-primary);
  border-radius: 14px;
  box-shadow: var(--panel-shadow);
}
header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  gap: 12px;
}
header {
  border-bottom: 1px solid var(--border-color);
}
h2 {
  font-size: 22px;
  margin: 0;
}
.plot-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 28px;
  padding: 24px;
}
.plot-controls,
.plot-preview-section {
  min-width: 0;
}
label,
.plot-preview-label,
legend {
  font-weight: 600;
  font-size: 14px;
}
textarea,
input[type='number'],
select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: inherit;
  padding: 10px;
  min-height: 44px;
  caret-color: var(--text-primary);
}
textarea {
  margin-top: 8px;
  resize: vertical;
  font-family: monospace;
  font-size: 16px;
}
fieldset {
  border: 0;
  margin: 20px 0 0;
  padding: 0;
}
legend {
  margin-bottom: 10px;
}
.plot-ranges {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.plot-ranges input {
  margin-top: 6px;
  font-variant-numeric: tabular-nums;
}
.plot-help {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 10px 0;
}
.plot-formula {
  overflow: auto;
  min-height: 28px;
  margin-top: 16px;
  padding-block: 8px;
}
.plot-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}
.plot-options label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.plot-options input {
  width: 18px;
  height: 18px;
  accent-color: var(--text-primary);
}
select {
  width: auto;
  max-width: 150px;
}
.plot-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  margin-top: 10px;
  overflow: hidden;
}
.plot-preview svg {
  width: 100%;
  height: 100%;
  display: block;
}
.plot-placeholder {
  padding: 24px;
  color: var(--text-secondary);
  font-size: 14px;
}
.plot-error {
  font-size: 14px;
  line-height: 1.5;
  color: var(--danger);
}
footer {
  justify-content: flex-end;
  border-top: 1px solid var(--border-color);
}
button {
  font: inherit;
  min-height: 44px;
  padding: 10px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-primary);
  cursor: pointer;
}
.plot-close {
  font-size: 26px;
  line-height: 1;
  padding: 6px 12px;
  background: transparent;
  border: 0;
}
.plot-submit {
  background: #357abd;
  color: white;
  border-color: #357abd;
  font-weight: 600;
}
button:hover:not(:disabled) {
  filter: brightness(0.94);
}
button:disabled {
  opacity: 0.55;
  cursor: default;
}
:is(button, textarea, input, select):focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 3px;
}
@media (max-width: 700px) {
  .plot-overlay {
    padding: 12px;
  }
  .plot-dialog {
    max-height: calc(100dvh - 24px);
  }
  .plot-body {
    grid-template-columns: 1fr;
    padding: 18px;
    gap: 18px;
  }
  header,
  footer {
    padding: 16px 18px;
  }
  .plot-preview-section {
    order: -1;
  }
  .plot-preview {
    max-height: 230px;
  }
  .plot-formula {
    margin-top: 8px;
  }
  fieldset {
    margin-top: 14px;
  }
}
</style>
