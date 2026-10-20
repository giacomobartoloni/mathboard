# Programmable Board — Acceptance and Regression Test Runbook

> **Proposed repository location:** `docs/programmable-board-acceptance-runbook.md`  
> **Scope:** MathBoard F014–F020, F017 live visual capture, and F033 local capability discovery  
> **Audience:** Human reviewer and coding agent  
> **Status:** Reusable test procedure; not evidence that a particular run passed  
> **Reviewed against:** `develop` commit `9433870abbba83313a69e18e992403f013f5eeb8` (2026-10-20). Re-verify source and HEAD on every future run.

## 1. Goal and acceptance boundary

Validate the complete local programmable-board loop against the **actual checked-out build**:

`discover → connect → observe → create → measure → layout → update styles → group → undo/redo → capture → reload → observe`

Also exercise atomic `deleteMany` and `clear` on disposable test content, and verify error rollback, Light/Dark ink semantics, editable LaTeX, and production isolation.

**An all-green CI run is necessary but not sufficient for a release.** Passing the runbook requires inspecting real rendered pixels, checking persistence and interaction behavior, recording evidence, and explicitly evaluating the release gates. Successful integration in `develop` does **not** mean the feature is present in `main` or deployed to `mathboard.app`.

This file is a repository-owned *test procedure*. The dated record of an actual execution (commit, environment, artifacts, observations, failures, human sign-off) belongs in an AgentWorklog Activity, not in this evergreen runbook. Do not embed individual test-run claims into this document.

## 2. Agent operating rules

1. Read the applicable user/global coding-agent rules, repository `AGENTS.md`, this runbook, and the linked source docs. Do not claim access to global files you cannot read. Repository state and executable contracts take precedence over historical worklog claims.
2. Record the actual harness/agent identity. If writing an AgentWorklog note as ChatGPT, use `agent: unknown` in its frontmatter and identify **ChatGPT** in the body. Never impersonate another coding agent.
3. Inspect `git status --short`, HEAD, target branch, Node version, and active port listeners **before** changing anything. Do not automatically discard, stash, reset, clean, checkout over, or overwrite user changes.
4. Use a dedicated, empty, **disposable** local browser board for mutation tests; obtain the owner's approval before running a mutating scenario. **Never call `clear` or `deleteMany` to prepare an unknown board.** Preserve genuine lesson content and local storage.
5. Keep the bridge on `127.0.0.1` only, and only in explicit `agent` mode. One controlled browser tab is supported. Never bind the development bridge to `0.0.0.0`, expose it on the LAN, or use it with production/student data.
6. Discover callable methods and patch schemas from the running `GET /__mathboard_agent/help`, not from a memorized method list. Discovery does not authorize mutation. After HTTP errors or disconnects, **observe before deciding to retry**; a mutation may have committed before transport failed.
7. Generate test artifacts under an external temporary directory (e.g. OS temp). Do not commit screenshots, traces, local board data, or student information to Git. Do not print screenshot base64 into logs.
8. Never merge, push, release, deploy, delete other worktrees, or mutate the default browser profile merely because the test procedure exists. Follow the user's specific authorization.

## 3. Authoritative references

| Area | Repository reference |
| --- | --- |
| Stack, commands, source conventions | [`AGENTS.md`](../AGENTS.md), [`package.json`](../package.json) |
| Bridge startup, HTTP envelope, readiness | [`docs/local-agent-dev-bridge.md`](local-agent-dev-bridge.md) |
| Live registry and executable schemas | [`dev-agent/command-contract.js`](../dev-agent/command-contract.js), [`docs/local-agent-api-help.md`](local-agent-api-help.md) |
| Coordinates/origin semantics | [`docs/semantic-positioning.md`](semantic-positioning.md) |
| Atomic deletion, one-step undo | [`docs/atomic-board-delete.md`](atomic-board-delete.md) |
| Grouping and child identity | [`docs/programmatic-group.md`](programmatic-group.md) |
| Measured layout, safe area | [`docs/semantic-auto-layout.md`](semantic-auto-layout.md) |
| Bounded styles, AUTO/FIXED, Formula paint | [`docs/history-safe-styles.md`](history-safe-styles.md) |
| Screenshot API, limits, read-only guarantee | [`docs/local-agent-visual-capture.md`](local-agent-visual-capture.md) |
| Executable unit/browser/bridge regressions | [`tests/`](../tests/), [`e2e/`](../e2e/), [`e2e-agent/`](../e2e-agent/) |

**Historical product gate:** `AgentWorklog/mathboard/ProductPlan.md` in the owner's Obsidian vault defines Phase 1's `create → position → group → update → visually inspect` milestone, preservation of Undo/Redo/persistence, and the requirement for visual/layout and long-ink verification. Consult the relevant Activity/specs as historical evidence, not as substitutes for current repository behavior.

**Contract-consistency gate:** `docs/local-agent-api-help.md`, `docs/history-safe-styles.md`, the executable `patchSchemas`, and F020 tests must agree on bounded post-creation style/ink updates. Any contradictory documentation is a regression to fix, not a reason to reinterpret the runtime contract.

## 4. Environment preflight (read-only)

Run from the repository root:

```bash
pwd
git remote -v
git branch --show-current
git rev-parse HEAD
git status --short
node --version
npm --version
```

**Expected:** correct MathBoard repository, intended tested ref, documented working-tree state, Node **22.x**. The exact SHA is recorded as evidence; future runs must not require the historical SHA above. If testing the integration target, use an up-to-date, clean `develop` checkout **only if switching/pulling cannot overwrite user changes**:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
git rev-parse HEAD
```

Check whether ports 5173 and 4173 are in use. On macOS/Linux:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN || true
lsof -nP -iTCP:4173 -sTCP:LISTEN || true
```

If occupied, identify the process and coordinate; do not kill unrelated servers. Use `npm ci` (the repository uses npm lockfile), then `npm run test:e2e:install` on a fresh machine or after a Playwright upgrade. A coding agent must report whether it actually executed each command.

## 5. Automated regression track — run sequentially

**Stop the manually launched `npm run dev:agent` server first.** The bridge Playwright config starts its own server on 5173 with `reuseExistingServer: false`; the normal E2E config uses 4173. Do not run these suites in parallel or while either port is owned by another process.

```bash
npm ci
npm run test:e2e:install  # only if Chromium is not already installed
npm run lint
npm run test:unit
npm run build
npm run assert:no-e2e-hook
npm run test:e2e
npm run test:agent-bridge
```

Checks and expected *semantics*:

| Gate | Pass condition |
| --- | --- |
| Lint/unit | Exit 0; no regressions or skipped failures hidden as successes |
| Production build/boundary | Build passes; `assert:no-e2e-hook` passes; production bundle does not expose E2E/agent internals |
| Browser E2E | Chromium test suite passes; examine failing traces and screenshots, not just a summary |
| Agent Bridge | Real local HTTP + browser suite passes for F014–F020/F033; server starts and stops correctly |
| Integration review | Runtime contract, geometry/history, themes, persisted BoardDocument and capture invariants remain consistent |

Never hardcode historical suite counts as future requirements: the reference merge had **318 unit, 62 E2E and 36 bridge tests**, but test counts can change legitimately. Record current totals, skipped cases, test config and HEAD for each run. If a gate fails, mark **FAIL**, preserve the evidence and stop promotion; do not paper over failures by deleting assertions.

For targeted debugging after the full run, use the actual existing spec files, e.g.:

```bash
npx playwright test --config playwright.agent.config.js e2e-agent/history-safe-style.spec.js
npx playwright test --config playwright.agent.config.js e2e-agent/semantic-layout.spec.js
npx playwright test --config playwright.agent.config.js e2e-agent/local-agent-help.spec.js
```

These use a self-managed agent server: ensure 5173 is free first. `npm run test:e2e` builds `dist-e2e`, which must **never** be deployed in place of production `dist/`.

## 6. Live manual / agent-assisted track

Run this separately from the automated suite. Use a disposable browser profile or new empty testing board; do not disturb any existing lesson or unsaved work.

### 6.1 Start and verify readiness

Terminal A:

```bash
npm run dev:agent
```

Open **one** local browser tab at `http://127.0.0.1:5173`. Terminal B:

```bash
curl -sS http://127.0.0.1:5173/__mathboard_agent/health
curl -sS http://127.0.0.1:5173/__mathboard_agent/help
curl -sS -X POST http://127.0.0.1:5173/__mathboard_agent/command \
  -H 'Content-Type: application/json' \
  -d '{"method":"observe","params":{}}'
```

**Gate:** `health.browserConnected === true`, `observe` returns `ok: true`, `result.stable === true`, a nonempty `boardId`, and an intentional test-board baseline. If the board is nonempty, **stop the mutating scenario**, preserve its contents, and prepare a separate disposable profile. `/help` may work with no browser connected; `browserConnected` alone does not imply `stable`.

Discover that the running build supports at least `observe`, `create`, `createMany`, `update`, `delete`, `deleteMany`, `clear`, `group`, `measure`, `layout`, and `screenshot`; require the corresponding schema fields to match the intended test. Additional future methods are not inherently failures. Requests use `POST /__mathboard_agent/command` with `{"method":"...","params":{...}}`. **There is no dedicated screenshot endpoint.**

### 6.2 Repeatable synthetic scenario (explicit opt-in)

After the owner approves mutations on an empty, disposable board, run this **from the repository root** in Terminal B. It uses Node 22, no new dependencies, dynamically captures IDs (never hardcode `mbobj_*`), saves a PNG/JSON report outside the repository, and intentionally leaves the demo on screen for visual and Undo/Redo checks. It **never calls `clear`**.

```bash
MATHBOARD_ALLOW_MUTATION=1 node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.env.MATHBOARD_ALLOW_MUTATION !== '1') {
  throw new Error('Explicit disposable-board mutation approval is required')
}
const base = 'http://127.0.0.1:5173'
const out = await mkdtemp(join(tmpdir(), 'mathboard-phase1-'))
const api = async (method, params = {}) => {
  const response = await fetch(`${base}/__mathboard_agent/command`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, params }),
  })
  const body = await response.json()
  if (!response.ok || !body.ok) {
    throw new Error(`${method}: HTTP ${response.status} ${JSON.stringify(body.error)}`)
  }
  return body.result
}
const health = await (await fetch(`${base}/__mathboard_agent/health`)).json()
assert.equal(health.browserConnected, true, 'Open exactly one local board tab')
const help = await (await fetch(`${base}/__mathboard_agent/help`)).json()
const methods = help.methods.map(item => item.method)
for (const method of ['observe', 'createMany', 'update', 'measure', 'layout', 'group', 'screenshot']) {
  assert.ok(methods.includes(method), `Unsupported by running build: ${method}`)
}
const initial = await api('observe')
assert.equal(initial.stable, true)
assert.equal(initial.objects.length, 0, 'Stop: this board is not disposable/empty')

const specs = [
  { type: 'text', text: 'Completing the square', fontSize: 30, left: 300, top: 140 },
  { type: 'formula', latex: 'x^2+6x+9=16', left: 300, top: 240 },
  { type: 'formula', latex: '(x+3)^2=16', left: 300, top: 340 },
  { type: 'ellipse', rx: 55, ry: 35, left: 700, top: 200, fill: null },
  { type: 'polygon', points: [{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 55, y: 90 }],
    left: 750, top: 350, fill: null, stroke: '#e8590c', strokeWidth: 4, mathboardInkMode: 'fixed' },
  { type: 'arrow', x1: 690, y1: 540, x2: 940, y2: 540,
    headLength: 20, headWidth: 14 },
]
const nodes = await api('createMany', { specs, options: { select: false } })
assert.equal(nodes.length, specs.length)
assert.deepEqual(nodes.map(n => n.type), specs.map(s => s.type))

const layout = await api('layout', {
  ids: nodes.slice(0, 3).map(n => n.id), direction: 'stack', gap: 24, margin: 32,
})
assert.equal(layout.objects.length, 3)
for (let i = 1; i < layout.objects.length; i++) {
  const prev = layout.objects[i - 1].bounds
  const next = layout.objects[i].bounds
  assert.ok(Math.abs(next.top - (prev.top + prev.height) - 24) < 1e-4)
}
const measured = await api('measure', { id: nodes[2].id })
assert.ok(measured.width > 0 && measured.height > 0)

await api('update', { id: nodes[2].id,
  patch: { fill: '#1864ab', opacity: 0.9, mathboardInkMode: 'fixed' } })
await api('update', { id: nodes[3].id,
  patch: { stroke: '#2f9e44', strokeWidth: 4, mathboardInkMode: 'fixed' } })
const grouped = await api('group', {
  ids: [nodes[3].id, nodes[4].id], options: { select: false },
})
assert.equal(grouped.type, 'group')

const beforeCapture = await api('observe')
assert.equal(beforeCapture.objects.length, 5)
assert.equal(beforeCapture.stable, true)
assert.equal(beforeCapture.objects.find(n => n.id === nodes[2].id).fill, '#1864ab')
const capture = await api('screenshot', {
  target: { kind: 'viewport' }, scale: 0.5,
})
assert.equal(capture.mimeType, 'image/png')
assert.equal(capture.encoding, 'base64')
const png = Buffer.from(capture.data, 'base64')
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
assert.deepEqual(await api('observe'), beforeCapture,
  'Read-only screenshot must not alter observed board state')

const rejected = await fetch(`${base}/__mathboard_agent/command`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ method: 'update', params: {
    id: nodes[2].id, patch: { strokeWidth: 4 },
  } }),
})
assert.equal(rejected.status, 409, 'Unsupported Formula style must reject')
assert.equal((await rejected.json()).error.code, 'invalid_object_patch')
assert.deepEqual(await api('observe'), beforeCapture,
  'Rejected patch must not alter the board')

const imagePath = join(out, 'phase1-canvas-viewport.png')
await writeFile(imagePath, png)
const record = {
  headHint: 'Record actual git rev-parse HEAD separately',
  boardId: initial.boardId,
  methods,
  ids: Object.fromEntries(nodes.map((node, i) => [specs[i].type + '-' + i, node.id])),
  groupId: grouped.id,
  observedTypes: beforeCapture.objects.map(node => node.type),
  imagePath,
  screenshotReadOnly: true,
  invalidFormulaPatchRejected: true,
}
await writeFile(join(out, 'phase1-observation.json'), JSON.stringify(record, null, 2))
console.log(`PASS: ${nodes.length} created, layout/measure/styles/group/capture/rejection verified`)
console.log(`Board ${initial.boardId}; group ${grouped.id}`)
console.log(`Evidence directory: ${out}`)
console.log('Leave the browser open for human review and single-step group Undo/Redo')
NODE
```

**Failure handling:** If any assertion fails, capture the exact error, current `observe`, HEAD and the stage reached. Do **not** blindly rerun this script: it may have left valid test objects on the board. Inspect first. If the viewport is too narrow or layout overflows, record actual dimensions and use a larger **disposable** test viewport; never suppress layout bounds checks.

### 6.3 Human-visible checks (required)

Use the synthetic board left by §6.2, not `mathboard.app`:

- [ ] **Rendered math:** LaTeX has readable exponents and typeset vectors; source is editable through the existing formula editor when the formula is a top-level root.
- [ ] **Layout:** title and formulas align, measured gaps appear even, and no controls, cookie banner, footer, or toolbar cover content. If a test diagram is poorly positioned despite valid JSON, record a visual failure.
- [ ] **Shapes:** ellipse, polygon and atomic arrow render without missing heads, strange clipping or unintended fills.
- [ ] **Group history:** the last mutation from §6.2 is `group`. Perform **one UI Undo** (Ctrl/Cmd+Z), then `observe`: two independent roots should replace the one composite (six roots total). **One UI Redo** (Ctrl/Cmd+Shift+Z) restores the group (five top-level roots), its child IDs and appearance. `screenshot`, `measure`, `/help` and rejected patches must not consume history steps.
- [ ] **AUTO/FIXED:** change Light → Dark → Light with the UI. The FIXED blue formula and FIXED green ellipse remain those exact colors. Unmodified AUTO-painted objects follow the current board theme. Explicit `fill:null`/`none` surfaces stay transparent. Theme switching itself adds no history entry.
- [ ] **Persistence:** after autosave has settled, capture an `observe` record, refresh the **same disposable tab** and re-observe. Formula LaTeX, IDs, parent/child group structure, style, theme-related ink semantics and geometry survive. A time delay alone is not proof of autosave; wait for observed persistence/UI completion or validate with a deterministic E2E storage flush when available.
- [ ] **Real pixels:** open `phase1-canvas-viewport.png` and separately capture/review the **full browser workspace**, because bridge viewport PNG omits HTML toolbar and selection overlays. Inspect at **1280×800 and 1024×768** where practical, plus a zoom/pan scenario. Save evidence with viewport/theme metadata.
- [ ] **Long-ink regression:** in a separate disposable board/fixture, draw a meaningful long pen stroke/session, select/manipulate strokes and repeatedly Undo/Redo. Check responsiveness and integrity; report duration, stroke count and device details, but do not invent performance thresholds.

For persisted formulas nested inside a Board Group, direct nested editing is not supported: use UI Ungroup before confirming that the restored formula is editable. Do not interpret that documented restriction as a failure.

### 6.4 Optional destructive operations — only on test content

Use a **separate disposable board or a specifically authorized follow-on step**. Before any deletion, write down the current top-level IDs and capture evidence. Do not remove anything from a shared or unknown board.

| Operation | Verification |
| --- | --- |
| `deleteMany({ids:[idA,idB]})` | Both known top-level roots disappear together; one UI Undo restores both with the same IDs, geometry and order; one Redo deletes them again |
| `deleteMany({ids:[idA,idA]})` | Duplicate ID is rejected; no partial changes or history mutation |
| `clear({})` | Clears only the approved disposable board; one UI Undo restores its previous roots and layout |
| Invalid `layout` (`gap:10000`) | Rejects when bounds cannot fit and preserves scene/Redo, with a suitably sized fixture |
| Formula `update` with unsupported `strokeWidth` | Returns HTTP 409 `invalid_object_patch`; exact board state remains unchanged |

Check the **existing, observed IDs** dynamically and use the same `/command` envelope as in §6.2. Do not replace an unsuccessful request with a direct Fabric mutation or unsupported API endpoint.

### 6.5 Development/production isolation check

After stopping `dev:agent`, verify normal dev mode and a local production build/preview **do not return the agent discovery JSON or accept agent mutations**. This is a security/deployment boundary, not a replacement for `npm run assert:no-e2e-hook` and the existing E2E coverage. Do not probe the public production site with mutating requests.

## 7. Acceptance matrix

| ID | Area | Minimum pass evidence | Status |
| --- | --- | --- | --- |
| A1 | Reproducible environment | HEAD/branch, clean-or-documented status, Node 22, base/ref | NOT RUN |
| A2 | Automated gates | Lint, unit, build, production boundary, E2E, Agent Bridge | NOT RUN |
| A3 | Discovery/readiness | `/help` capability inventory, `/health`, stable `observe` | NOT RUN |
| A4 | Semantic creation/positioning | Text/formula/ellipse/polygon/arrow IDs, origins, visible result | NOT RUN |
| A5 | Measurement/layout | Safe-area fit, measured 24-unit gaps, no UI occlusion | NOT RUN |
| A6 | History-safe style | FIXED/AUTO, primitive transparency, Formula paint, bounded failure | NOT RUN |
| A7 | Group/Undo/Redo | One-step history, stable child IDs, no history mutation on read | NOT RUN |
| A8 | Read-only screenshot | Valid PNG, saved actual pixels, identical pre/post observe | NOT RUN |
| A9 | Persistence & editability | Reload round trip, editable LaTeX and preserved group structure | NOT RUN |
| A10 | Atomic delete/clear | Explicitly approved disposable test, one-step Undo, rejection atomicity | NOT RUN |
| A11 | UX/performance smoke | Real full-page image, narrow viewport, zoom/pan, long ink | NOT RUN |
| A12 | Release boundaries | No agent APIs in normal/prod; main/deployment independently checked | NOT RUN |

Record **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** for each row in the dated execution report. A manual visual test can be **FAIL** even if A2 passes. A required **BLOCKED** or **NOT RUN** gate prevents declaring Phase 1 fully accepted; only the owner can explicitly waive it with a recorded rationale.

## 8. Execution report template (copy into a dated AgentWorklog Activity)

Do not edit completed historical Activities merely to create a new run. Use `AgentWorklog/mathboard/Activities/YYYY-MM-DD-programmable-board-acceptance.md` (vault-relative), creating a collision-safe suffix only when necessary. Follow the vault template. Example fields:

```markdown
---
type: activity
repo: mathboard
agent: unknown
branch: develop
worktree: null
status: active
created: YYYY-MM-DD
updated: YYYY-MM-DD
completed_at: null
tags: [activity, mathboard, phase1, acceptance, verification]
---

# Programmable Board Phase 1 — Acceptance Run

## Harness and provenance
- Executing agent / harness: <actual identity>
- Test date / machine / OS / Node version:
- Repository, branch, HEAD and `git status --short`:
- Source runbook revision:
- Disposable board used; human mutation approval:

## Automated gates
| Command / CI link | Outcome | Counts / failure references |
| --- | --- | --- |
| `npm run lint` | NOT RUN | |
| `npm run test:unit` | NOT RUN | |
| `npm run build` / `assert:no-e2e-hook` | NOT RUN | |
| `npm run test:e2e` | NOT RUN | |
| `npm run test:agent-bridge` | NOT RUN | |

## Interactive acceptance
| Gate A1–A12 | Status | Evidence / exact observation |
| --- | --- | --- |
| A1 | NOT RUN | |

## Visual evidence
- Screenshot paths (synthetic only):
- Viewport sizes, zoom/pan, Light/Dark:
- Readability, clipping, safe margins, formula editability:
- Observed vs rendered mismatches:

## Failures / reproduction
- Expected / actual:
- Request/response and sanitized object IDs:
- Steps, trace/screenshot, suspected cause:

## Outcome and verification
- Phase 1 acceptance: PASS / FAIL / BLOCKED
- Open risks / deferrals:
- Owner sign-off and release recommendation:
- Confirm no unapproved push/merge/deploy:
```

Only close an Activity (`status: completed`, `completed_at`) once its **own** executed test scope and evidence are complete. An incomplete or blocked run must be described honestly, rather than marked fully passed because a different CI run was green.

## 9. Maintenance policy

- Keep this runbook in the repository beside the API docs so code and acceptance expectations can evolve in the **same PR**. Use Git review for changes to command shapes, security boundaries or release criteria.
- If supported methods/schema/contract change, update this document **and** executable tests; do not relax tests solely to obtain a green badge. Treat `/help` as build-specific and executable validator/controller behavior as final authority.
- Prefer small, dedicated Playwright regressions in `e2e-agent/` or `e2e/` for bugs discovered during manual testing; keep this Markdown as the operator-facing checklist rather than a second, unmaintained test framework.
- Preserve dated evidence and decisions in the Obsidian AgentWorklog; do not copy the owner's global agent configuration into the vault or the repository.
- The next integration/release decision must separately verify `main` ancestry, required branch checks, human visual approval and actual deployment. This runbook does not authorize that promotion.
