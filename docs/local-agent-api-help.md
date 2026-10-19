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

# Local API help for agents

Start Node22 and `npm run dev:agent`, bound to127.0.0.1. Discovery works without a browser:

```bash
curl -s http://127.0.0.1:5173/__mathboard_agent/help
```

The response is deterministic JSON with `schemaVersion:1`, a JSON Schema2020-12 dialect, HTTP `commandEndpoint`/`healthEndpoint`, semantic `methods`, supported `objectTypes`, per-type `patchSchemas`, synthetic examples, limitations and readiness/error guidance. It contains no board contents, selection, history, IDs from a live board or connection-dependent fields. Read `health.browserConnected` separately: it means transport connectivity, not a stable board. Help never calls BoardController.

Each method includes `method`, `summary`, `mutatesBoard`, `requiresStable`, `paramsSchema`, `resultSchema`, `successStatus`, `errors` and `example`. Results describe detached semantic data; the output schemas are partial descriptions (additional fields allowed). Formula nodes preserve LaTeX without exposing internal SVG paths.

This build exposes exactly `observe`, `create`, `createMany`, `update`, `delete`, `deleteMany`, `clear`, `group`, read-only `measure`, mutating `layout` and read-only `screenshot`. A create spec can describe rect/circle/ellipse/line/path/text/formula/group. The semantic `ellipse` type requires finite nonnegative `rx` and `ry`; its description and required geometry fields come from the canonical runtime discovery schema. Creating a group tree is different from grouping existing IDs. Polygon/arrow object types and unlisted methods are not executable in this build. Discover the running build rather than assuming another branch's features are available.

## Local tool adapter

An LLM host can derive per-method tool declarations from the returned metadata:

```js
const base = 'http://127.0.0.1:5173'
const help = await (await fetch(`${base}/__mathboard_agent/help`)).json()
if (help.schemaVersion !== 1) throw new Error('Unsupported discovery schema')
const tools = help.methods.map(method => ({
  name: method.method,
  description: method.summary,
  parameters: method.paramsSchema,
}))
```

Tool names above are semantic method tokens, not separate HTTP routes. The adapter maps every invocation to the discovered endpoint:

```js
// This approval flag must come from the trusted human/host policy, never the model.
async function invokeTool(name, args, approvedByHuman = false) {
  const method = help.methods.find(item => item.method === name)
  if (!method) throw new Error('Unknown tool')
  if (method.mutatesBoard && !approvedByHuman) throw new Error('Approval required')
  // Validate args against method.paramsSchema in your host's JSON Schema implementation.
  const post = async (method, params) => {
    const response = await fetch(base + help.commandEndpoint.path, {
      method: help.commandEndpoint.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ method, params }),
    })
    const body = await response.json()
    if (!response.ok || !body.ok) throw new Error(body.error?.message || 'Command failed')
    return body.result
  }
  if (method.requiresStable && !(await post('observe', {})).stable) {
    throw new Error('Wait for a stable board')
  }
  return post(method.method, args)
}
```

Before use, check health, connect one browser tab, and observe `stable:true`. After each mutation observe and verify. On disconnect/timeout, reconnect and observe before deciding whether to retry: the original mutation may have committed. Discovery grants no authorization and the bridge itself adds no permission system.

`e2e-agent/local-agent-help.spec.js` is the executable synthetic adapter proof: discovered schemas produce tool declarations, missing required parameters and unapproved mutations are rejected locally, and an approved create plus the remaining methods operate on the real browser. It verifies formulas remain editable, repeated help leaves scene/selection unchanged and preserves Redo. The read-only screenshot command returns a bounded base64 PNG using the existing command endpoint, not a new REST route. An image-capable adapter must decode and supply the bytes as image input; base64 text by itself is not visual inspection. No LLM SDK is required.

## Schemas and compatibility

Create schemas have type-specific required fields, reject unknown fields and describe recursive groups using local `$defs` references. Path contents are intentionally permissive, matching the existing validator; materialization may still reject malformed Fabric path commands. Creation ignores supplied IDs and assigns fresh identities. New programmable `create` and `createMany` objects default omitted `originX`/`originY` to `left`/`top`, recursively within newly created groups. The create schemas annotate these defaults; update patches do not default origins. Explicit named and finite numeric origins remain supported. Positions use scene units, not viewport pixels. Existing BoardDocuments, Stamps and UI-created objects retain their previous placement semantics; line/path coordinates remain intrinsic when `left`/`top` are omitted. See [Semantic Positioning](semantic-positioning.md).

Update accepts a type-dependent union: transforms for shapes/groups, transforms/text fields for text, transforms/LaTeX for formulas. Consult `patchSchemas` using the observed object's semantic type. The union does not authorize LaTeX on rectangles. F015 adds atomic `deleteMany({ ids })` and `clear({})`, both mutating operations requiring a stable board and caller authorization. `deleteMany` requires unique nonempty top-level object IDs; duplicate/unknown/nested IDs fail the whole command without partial deletion. Both operations return removed semantic nodes in original canvas order, and empty requests are history-preserving no-ops. Nonempty calls require only one UI Undo/Redo. See [Atomic Board Deletion](atomic-board-delete.md). F016 additionally exposes `group({ ids, options })` for at least two distinct existing top-level groupable IDs. Existing Board Groups and nested children cannot be regrouped directly. The new composite receives a fresh ID, preserves child IDs and geometry, moves to the front of the canvas stack, and records one retained group history command. `options.select` optionally selects it; UI Undo restores original roots. See [Programmable Grouping](programmatic-group.md). F018 adds read-only `measure({ id })` and atomic `layout({ ids, direction, gap, margin, left, top })` via the canonical registry. Measurement returns detached scene AABB. Layout aligns stack/row bounds, with gap (default 24) and positions in scene units, margin (default 16) in CSS pixels, and a DOM-safe viewport area provided by DrawBoard. Overflow rejects atomically; effective moves use one Undo and no-ops preserve Redo. See [Measured Semantic Layout](semantic-auto-layout.md). This build rejects post-creation style and ink changes. Selection options document the supported boolean usage; other adapter parameters/options are ignored. Runtime controller validation remains authoritative. Examples using `mbobj_example` require substitution with an existing observed ID.

One dev-only registry, `dev-agent/command-contract.js`, owns descriptions and explicit handler closures. The screenshot descriptor is supplied by `dev-agent/capture/discovery.js` so its geometry, media and byte limits match the existing capture contract. F015's deletion methods and F016's grouping method use explicit closures and shared schema descriptors from this same registry; no duplicate browser switch or Vite allowlist is maintained. Both relay validation and browser execution consume it. There is no arbitrary controller-property invocation. When integrating a new command, register its description/schema/example and explicit handler together; do not resurrect an independent switch/allowlist. For new types or patch fields update schemas and validator parity cases in the same change. This is integration work for those PRs, not an assumption that their operations are already present.

Unknown names (including prototype properties) return HTTP400 `invalid_command` before browser connectivity checks. Known commands preserve existing409 domain errors,503 disconnected/unavailable behavior and504 timeout guidance. Only explicit agent mode installs the help handler; normal dev/production do not expose it. Internal browser relay routes are intentionally absent from tool discovery. Optional OpenAPI generation is deferred rather than introducing a second manually maintained contract.

## Verify

Run sequentially, with no separate dev server occupying5173/4173:

```bash
npm run lint
npm run test:unit
npm run build
npm run assert:no-e2e-hook
npm run test:e2e
npm run test:agent-bridge
```

The unit tests cover disconnected help over real HTTP, unknown-name rejection, schema/validator agreement, screenshot registry parity and normal development-mode exclusion. For actual PNG region/ID/viewport behavior, run the existing capture bridge tests and consult [Local Agent Visual Capture](local-agent-visual-capture.md). Existing production instrumentation scanning checks the built bundle; production preview must not return discovery JSON. The live bridge suite covers unchanged commands and the local adapter workflow.
