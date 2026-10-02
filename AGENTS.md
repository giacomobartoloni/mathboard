# MathBoard — AGENTS.md

## Stack

- **Vue 3** (Options API with `setup()` — not `<script setup>`, not Composition API exclusively)
- **Vite 6** (`vite`), **npm** (migrated from Vue CLI 5 in feature/vite-migration)
- **Fabric.js 7** (canvas drawing), **KaTeX** (LaTeX rendering), **html2canvas** (formula→canvas conversion)
- **FontAwesome 6** global registration in `main.js`, used as `<font-awesome-icon :icon="['fas', 'name']" />`
- **Cloudflare** is the deployment target: `wrangler.json` serves `./dist` as static assets. Firebase is not used in the runtime, build, or deploy
- **No TypeScript, no tests, no typecheck** — verification is `npm run lint` plus `npm run build`

## Commands

```sh
npm ci               # install deps from the lockfile (not yarn)
npm run dev          # dev server with HMR (Vite)
npm run build        # production build to dist/
npm run preview      # serve the dist/ build locally
npm run lint         # eslint (vue3-essential + eslint:recommended); reports, does not fix
npm run generate:icons # regenerate public/icon-192x192.png and public/icon-512x512.png from tools/icon-template.html
```

## Architecture

- **Entrypoint**: `src/main.js` — creates Vue app, registers FontAwesome globally, mounts `#app`
- **App.vue** orchestrates all components, manages tool state, zoom, formula modal
- **Components** live in `src/components/` — PascalCase filenames, PascalCase in templates
- **DrawBoard.vue** is the core — wraps Fabric.js `Canvas`, manages zoom/pan/history/undo/redo/tools
- **`fabricStaticCanvas.js`** is a **mixin** (not a component), provides `isDrawingMode` prop
- **Event naming**: kebab-case (`@request-formula`, `@edit-formula`, `@text-editing-completed`)
- **Tools** (select/pan/pencil/font/formula/shapes/stamps) communicate via props+events from ToolsPanel through App to DrawBoard
- **Stamps**: portable base64url JSON in `src/stamps/`; `insertStamp` adds a Group at viewport center with board-default AUTO ink for kit objects; `bootstrapFromStamp` clears board + resets history (URL `#s=`). Share selection: Ctrl/Cmd+Shift+L opens a modal with `#s=` URL (`exportSelectionToStamp`). About lists shipped shortcuts from `SHORTCUT_HELP` in `src/config/shortcuts.js`. ADR: `docs/adr/0003-stamp-transfer-format.md`
- **Grouping**: permanent Fabric `Group`; selection panel + Ctrl/Cmd+G / Ctrl/Cmd+Shift+G; history commands `group` / `ungroup`

## Key implementation details

- **Formulas**: entered in `FormulaModal` (KaTeX render preview), emitted as `{ latex, html }`, converted to canvas image via html2canvas on a temp div
- **Undo/redo**: command log, one entry per gesture, limit 50. Decision: `docs/adr/0001-command-log-history.md`
- **Pan**: manipulates `viewportTransform[4/5]` directly
- **Zoom**: `canvas.setZoom()`, clamp 0.1–5x
- **Shapes**: submenu in ToolsPanel; Rect, Circle, Line drawn via mouse drag
- **Stamps / kits**: ToolsPanel stamp submenu (magic-wand) inserts built-in kits (`cartesianPlane`, `unitCircle`) with board default ink; URL `#s=<payload>` bootstraps on load then `replaceState`; Ctrl/Cmd+Shift+L shares the active selection as a deep link

## Deployment

- **GitHub Actions** (`.github/workflows/main.yml`) runs CI checks only, on push and pull request for `main` and `develop`: `npm ci`, `npm run lint`, `npm run build`. No deploy job, no secrets.
- **Cloudflare** is the deployment target: `wrangler.json` serves `./dist` as static assets.
- Firebase is not used: no dependency, runtime import, or deploy step.

## Licensing

All source files must carry the AGPL v3 header (see existing files for format).

## Notable commit history

- b39ee1d: moved from yarn to npm (Cloudflare build compat)
- a284e88: added wrangler.json for CF Workers static asset deployment
