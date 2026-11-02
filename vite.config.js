/*
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
*/

import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { localAgentModePlugin } from './tools/vite/local-agent-mode-plugin.mjs'

function e2eEntryPlugin() {
  return {
    name: 'mathboard-e2e-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          'src="/src/main.js"',
          'src="/e2e/main.js"',
        )
      },
    },
  }
}

const host = process.env.TAURI_DEV_HOST
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const tauriBuildOptions = tauriPlatform
  ? {
      build: {
        target: tauriPlatform === 'windows' ? 'chrome105' : 'safari13',
        minify: !process.env.TAURI_ENV_DEBUG,
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
        // Native settings have their own entrypoint. The web build includes only index.html.
        rollupOptions: {
          input: {
            main: fileURLToPath(new URL('./index.html', import.meta.url)),
            'mcp-settings': fileURLToPath(new URL('./desktop/mcp-settings.html', import.meta.url)),
          },
        },
      },
    }
  : {}

export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    ...(mode === 'e2e' ? [e2eEntryPlugin()] : []),
    ...(mode === 'agent' ? [localAgentModePlugin()] : []),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  ...tauriBuildOptions,
}))
