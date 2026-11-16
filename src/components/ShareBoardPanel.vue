<!--
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
  <div class="share-board-backdrop" @click="close">
    <section class="share-board-panel" role="dialog" aria-modal="true"
      aria-labelledby="share-board-title" @click.stop @keydown.esc.stop.prevent="close">
      <header class="share-board-header">
        <h2 id="share-board-title">Share board</h2>
        <button class="share-board-close" type="button" :disabled="busy" aria-label="Close share panel" @click="close">×</button>
      </header>
      <template v-if="!url">
        <p>Share an independent, editable copy of your current board.</p>
        <button ref="primary" class="share-board-primary" type="button" :disabled="busy" @click="$emit('request-link')">
          {{ busy ? 'Creating link…' : 'Get shareable link' }}
        </button>
        <p v-if="error" class="share-board-error" role="alert">{{ error }}</p>
        <small>Links expire after 90 days. Anyone with the full link can open a copy.</small>
      </template>
      <template v-else>
        <p>Link ready. Anyone with it can open an editable copy. Changes won't sync.</p>
        <label for="share-board-url">Shareable link</label>
        <textarea id="share-board-url" ref="urlInput" :value="url" rows="3" readonly @focus="$event.target.select()"></textarea>
        <button ref="primary" class="share-board-primary" type="button" @click="copyLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
        <p v-if="error" class="share-board-error" role="alert">{{ error }}</p>
        <small>Link expires after 90 days.</small>
      </template>
    </section>
  </div>
</template>

<script>
export default {
  name: 'ShareBoardPanel',
  props: {
    busy: { type: Boolean, default: false },
    url: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  emits: ['close', 'request-link', 'copied', 'copy-failed'],
  data() { return { copied: false } },
  mounted() { this.$nextTick(() => this.$refs.primary?.focus()) },
  watch: { url() { this.$nextTick(() => this.$refs.primary?.focus()) } },
  methods: {
    close() { if (!this.busy) this.$emit('close') },
    async copyLink() {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(this.url)
        } else {
          this.$refs.urlInput?.select()
          if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
        }
        this.copied = true
        this.$emit('copied')
      } catch {
        this.$emit('copy-failed')
      }
    },
  },
}
</script>

<style scoped>
.share-board-backdrop { position: fixed; inset: 0; z-index: 2200; background: rgba(0, 0, 0, .15); }
.share-board-panel { position: absolute; top: 68px; right: max(12px, env(safe-area-inset-right)); width: min(340px, calc(100vw - 24px));
  box-sizing: border-box; padding: 18px; text-align: left; border: 1px solid var(--border-color); border-radius: 12px;
  background: var(--surface-secondary); color: var(--text-primary); box-shadow: var(--panel-shadow); }
.share-board-header { display: flex; align-items: center; justify-content: space-between; }
.share-board-header h2 { font-size: 17px; margin: 0; }
.share-board-close { background: none; border: 0; color: var(--text-primary); cursor: pointer; font-size: 24px; }
.share-board-panel p { font-size: 14px; line-height: 1.5; color: var(--text-secondary); }
.share-board-panel label { display: block; font-size: 13px; margin-bottom: 5px; }
.share-board-panel textarea { resize: none; width: 100%; box-sizing: border-box; border: 1px solid var(--border-color);
  background: var(--surface-tertiary); color: var(--text-primary); border-radius: 6px; padding: 8px; }
.share-board-primary { display: block; width: 100%; min-height: 44px; margin: 12px 0; cursor: pointer; border-radius: 8px;
  border: 0; background: var(--selected-bg); color: var(--selected-text); font: inherit; font-weight: 600; }
.share-board-primary:disabled { opacity: .65; cursor: wait; }
.share-board-panel small { display: block; font-size: 12px; color: var(--text-muted); }
.share-board-panel .share-board-error { color: var(--danger); }
</style>
