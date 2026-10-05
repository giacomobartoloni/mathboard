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
  <div v-if="isVisible" class="modal-overlay" @click="closeModal">
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-stamp-title"
      @click.stop
    >
      <div class="modal-header">
        <h3 id="share-stamp-title">Share board link</h3>
        <button type="button" class="close-button" @click="closeModal" aria-label="Close">&times;</button>
      </div>

      <div class="modal-body">
        <label for="share-stamp-url">Anyone with this link opens a board with the current selection:</label>
        <textarea
          id="share-stamp-url"
          ref="urlField"
          :value="url"
          readonly
          rows="4"
          @focus="selectUrl"
        ></textarea>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn-cancel" @click="closeModal">Close</button>
        <button type="button" class="btn-copy" @click="copyUrl">{{ copyLabel }}</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ShareStampModal',
  emits: ['close', 'copied', 'copy-failed'],
  props: {
    isVisible: {
      type: Boolean,
      default: false,
    },
    url: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      copyLabel: 'Copy',
      copyResetTimer: null,
    }
  },
  methods: {
    selectUrl() {
      const field = this.$refs.urlField
      if (field && typeof field.select === 'function') {
        field.select()
      }
    },
    async copyUrl() {
      const text = this.url
      if (!text) {
        this.$emit('copy-failed')
        return
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
        } else {
          this.selectUrl()
          const copied = document.execCommand('copy')
          if (!copied) {
            throw new Error('Copy command failed')
          }
        }
        this.copyLabel = 'Copied'
        this.$emit('copied')
        if (this.copyResetTimer) clearTimeout(this.copyResetTimer)
        this.copyResetTimer = setTimeout(() => {
          this.copyLabel = 'Copy'
          this.copyResetTimer = null
        }, 1500)
      } catch {
        this.selectUrl()
        this.$emit('copy-failed')
      }
    },
    closeModal() {
      if (this.copyResetTimer) {
        clearTimeout(this.copyResetTimer)
        this.copyResetTimer = null
      }
      this.copyLabel = 'Copy'
      this.$emit('close')
    },
  },
  watch: {
    isVisible(visible) {
      if (visible) {
        this.copyLabel = 'Copy'
        this.$nextTick(() => {
          this.selectUrl()
          const field = this.$refs.urlField
          if (field) field.focus()
        })
      }
    },
  },
  beforeUnmount() {
    if (this.copyResetTimer) clearTimeout(this.copyResetTimer)
  },
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--surface-secondary);
  border-radius: 12px;
  width: 90%;
  max-width: 560px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  font-size: 32px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-button:hover {
  background-color: var(--hover-bg);
  color: var(--text-primary);
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
  text-align: left;
}

.modal-body label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 14px;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
  background: var(--surface-muted);
  color: var(--text-primary);
  word-break: break-all;
}

textarea:focus {
  outline: none;
  border-color: #4a90e2;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.btn-cancel,
.btn-copy {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--surface-muted);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  background: var(--hover-bg);
}

.btn-copy {
  background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
  color: white;
}

.btn-copy:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
}
</style>
