# MathBoard — AGENTS.md

## Stack

- **Vue 3** (Options API with `setup()` — not `<script setup>`, not Composition API exclusively)
- **Vite 6** (`vite`), **npm** (migrated from Vue CLI 5 in feature/vite-migration)
- **Fabric.js 6** (canvas drawing), **KaTeX** (LaTeX rendering), **html2canvas** (formula→canvas conversion)
- **FontAwesome 6** global registration in `main.js`, used as `<font-awesome-icon :icon="['fas', 'name']" />`
- **Firebase Hosting** (CI deploys hosting only) + **Cloudflare Workers** (wrangler.json serves `./dist` as static assets)
- **No TypeScript, no tests, no typecheck** — lint is the only verification step

## Commands

```sh
npm install          # install deps (not yarn)
npm run dev          # dev server with HMR (Vite)
npm run build        # production build to dist/
npm run lint         # eslint (vue3-essential + eslint:recommended)
```

## Architecture

- **Entrypoint**: `src/main.js` — creates Vue app, registers FontAwesome globally, mounts `#app`
- **App.vue** orchestrates all components, manages tool state, zoom, formula modal
- **Components** live in `src/components/` — PascalCase filenames, PascalCase in templates
- **DrawBoard.vue** is the core — wraps Fabric.js `Canvas`, manages zoom/pan/history/undo/redo/tools
- **`fabricStaticCanvas.js`** is a **mixin** (not a component), provides `isDrawingMode` prop
- **Event naming**: kebab-case (`@request-formula`, `@edit-formula`, `@text-editing-completed`)
- **Tools** (select/pan/pencil/font/formula/shapes) communicate via props+events from ToolsPanel through App to DrawBoard

## Key implementation details

- **Formulas**: entered in `FormulaModal` (KaTeX render preview), emitted as `{ latex, html }`, converted to canvas image via html2canvas on a temp div
- **Undo/redo**: JSON-serialized canvas state history (limit 50), uses `util.enlivenObjects` on restore
- **Pan**: manipulates `viewportTransform[4/5]` directly
- **Zoom**: `canvas.setZoom()`, clamp 0.1–5x
- **Shapes**: submenu in ToolsPanel; Rect, Circle, Line drawn via mouse drag

## Deployment

- **GitHub Actions** (`.github/workflows/main.yml`): on push to master → `npm install && npm build` → `firebase deploy --only hosting`
- Firebase functions (`functions/`) are legacy/stub on **Node 8** — not deployed, not used
- Cloudflare Workers: `wrangler.json` configures `./dist` as static assets (manual deploy)

## Licensing

All source files must carry the AGPL v3 header (see existing files for format).

## Notable commit history

- b39ee1d: moved from yarn to npm (Cloudflare build compat)
- a284e88: added wrangler.json for CF Workers static asset deployment
