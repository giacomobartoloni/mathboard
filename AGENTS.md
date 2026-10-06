# MathBoard — AGENTS.md

## Stack

- **Vue 3** (Options API with `setup()` — not `<script setup>`, not Composition API exclusively)
- **Vite 6** (`vite`), **npm** (migrated from Vue CLI 5 in feature/vite-migration)
- **Fabric.js 7** (canvas drawing), **KaTeX** (LaTeX rendering), **html2canvas** (formula→canvas conversion)
- **FontAwesome 6** global registration in `main.js`, used as `<font-awesome-icon :icon="['fas', 'name']" />`
- **Cloudflare** is the deployment target: `wrangler.json` serves `./dist` as static assets. Firebase is not used in the runtime, build, or deploy
- **No TypeScript, no typecheck** — verification is `npm run lint`, `npm run test:unit`, `npm run build`, and `npm run test:e2e`

## Commands

```sh
npm ci               # install deps from the lockfile (not yarn)
npm run dev          # dev server with HMR (Vite)
npm run build        # vite build + tools/build-seo.mjs → dist/ (app + static SEO pages)
npm run build:app    # Vite only
npm run build:seo    # SEO sidecar into dist/ (requires prior build:app)
npm run build:e2e    # Vite e2e mode → dist-e2e/ via e2e/main.js (read-only canvas hook; never deploy)
npm run preview      # serve the dist/ build locally
npm run lint         # eslint (vue3-essential + eslint:recommended); reports, does not fix
npm run test         # alias for test:unit
npm run test:unit    # node:test suite in tests/
npm run test:e2e:install # download Playwright Chromium (once per machine / after upgrades)
npm run test:e2e     # build:e2e + Playwright Chromium P0 suite
npm run test:e2e:ui  # same with Playwright UI
npm run assert:no-e2e-hook # fail if dist/ contains E2E instrumentation markers
npm run assert:e2e-hook  # fail if dist-e2e/ is missing the E2E canary
npm run generate:icons # regenerate public/icon-192x192.png and public/icon-512x512.png from tools/icon-template.html
```

## Architecture

- **Entrypoint**: `src/main.js` → `mountMathBoard()` in `src/app-bootstrap.js` (composition root). E2E entry `e2e/main.js` mounts the same bootstrap then installs the board hook.
- **Services**: `createMathBoardServices()` builds `BoardObjectPolicy` and the formula renderer; `app.provide(MATHBOARD_SERVICES, …)` injects them. Keep services out of Vue `data()` so they are not reactive proxies.
- **App.vue** orchestrates all components, manages tool state, zoom, formula modal
- **Components** live in `src/components/` — PascalCase filenames, PascalCase in templates
- **DrawBoard.vue** is the core — wraps Fabric.js `Canvas`, manages zoom/pan/history/undo/redo/tools; orchestrates formula workflows but does not implement KaTeX/html2canvas rendering
- **Object semantics**: MathBoard semantic classification is centralized in `src/board/BoardObjectPolicy.js`; product logic must not infer Formula or Board Group solely from Fabric runtime class/type. Formula precedes Group. ADR: `docs/adr/0004-semantic-object-model-and-renderer-boundaries.md`
- **`fabricStaticCanvas.js`** is a **mixin** (not a component), provides `isDrawingMode` prop
- **Event naming**: kebab-case (`@request-formula`, `@edit-formula`, `@text-editing-completed`)
- **Tools** (select/pan/pencil/font/formula/shapes/stamps) communicate via props+events from ToolsPanel through App to DrawBoard
- **Stamps**: portable base64url JSON in `src/stamps/`; `insertStamp` adds a Group at viewport center with board-default AUTO ink for kit objects; `bootstrapFromStamp` clears board + resets history (URL `#s=`). Share selection: Ctrl/Cmd+Shift+L opens a modal with `#s=` URL (`exportSelectionToStamp`). About lists shipped shortcuts from `SHORTCUT_HELP` in `src/config/shortcuts.js`. ADR: `docs/adr/0003-stamp-transfer-format.md`
- **Grouping**: permanent Fabric `Group`; selection panel + Ctrl/Cmd+G / Ctrl/Cmd+Shift+G; history commands `group` / `ungroup`

## Key implementation details

- **Formulas**: FormulaModal uses KaTeX for entry/preview. Board formula rendering is isolated behind `KaTeXBitmapFormulaRenderer`; DrawBoard must not depend directly on KaTeX/html2canvas/FabricImage rendering details. The adapter is intended to be replaced by MathJax SVG. ADR: `docs/adr/0004-semantic-object-model-and-renderer-boundaries.md`
- **Undo/redo**: command log, one entry per gesture, limit 50. Decision: `docs/adr/0001-command-log-history.md`
- **Pan**: manipulates `viewportTransform[4/5]` directly
- **Zoom**: `canvas.setZoom()`, clamp 0.1–5x
- **Shapes**: submenu in ToolsPanel; Rect, Circle, Line drawn via mouse drag
- **Stamps / kits**: ToolsPanel stamp submenu (magic-wand) inserts built-in kits (`cartesianPlane`, `unitCircle`) with board default ink; URL `#s=<payload>` bootstraps on load then `replaceState`; Ctrl/Cmd+Shift+L shares the active selection as a deep link
- **E2E selectors**: prefer semantic, user-facing locators (`role`, accessible name, labels). Do not add `data-testid`, `data-e2e`, `data-qa`, or equivalent test-only attributes to application source unless there is a documented architectural exception. Board observability lives in `e2e/instrumentation/` and is mounted only via `e2e/main.js` (Vite MODE=e2e); `src/` must not reference Playwright or `__MATHBOARD_E2E__`

## Deployment

- **GitHub Actions** (`.github/workflows/main.yml`) — workflow `CI`, jobs `Quality` and `E2E (Chromium)` (`needs: quality`). Triggers: push/PR to `main`/`develop`, plus `workflow_dispatch`. Quality: `npm ci`, lint, `test:unit`, build, `assert:no-e2e-hook`. E2E: Playwright Chromium against `dist-e2e/`; on failure uploads `playwright-report/` + `test-results/` (7-day retention). No `continue-on-error`, no deploy job, no secrets. Progressive gating: require Quality first; make E2E required only after it is stable on `develop`/`main`.
- **Cloudflare** is the deployment target: `wrangler.json` serves `./dist` as static assets.
- Firebase is not used: no dependency, runtime import, or deploy step.

## Licensing

All source files must carry the AGPL v3 header (see existing files for format).

## Notable commit history

- b39ee1d: moved from yarn to npm (Cloudflare build compat)
- a284e88: added wrangler.json for CF Workers static asset deployment
