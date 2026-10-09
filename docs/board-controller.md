# Local Board Controller

`BoardController` is a Vue-independent application boundary for one live Fabric canvas. Fabric remains runtime state; the controller returns detached semantic data, never Fabric objects. DrawBoard owns its controller outside reactive `data()` and exposes it to internal adapters through `getBoardController()`.

## API

```js
const objects = await board.createMany([
  { type: 'text', text: 'Quadratic equation', left: 300, top: 180 },
  { type: 'formula', latex: 'ax^2+bx+c=0', left: 320, top: 250 },
])
const formula = board.get(objects[1].id)
await board.update(formula.id, { latex: 'x=2', left: 350 })
const scene = board.observe()
await board.delete(formula.id)
```

- `create(spec, { select: false })` returns one semantic object and commits one `add` command.
- `createMany(specs, { select: false })` accepts a non-empty array and returns independent objects in input order. All objects materialize before insertion; one `batch-add` command makes the batch undoable in one step. With `select: true`, multiple objects form a temporary ActiveSelection.
- `get(id)` returns a detached semantic object or `null`, searching Board Group children recursively.
- `getObjects()` returns top-level objects in canvas z-order, with recursive semantic Board Group children and canvas-plane positions for ActiveSelection members.
- `update(id, patch)` returns the updated semantic object. Top-level transform fields and Text content/font fields are supported. Formula `latex` rerenders off-canvas, preserving identity, transform, opacity and z-order.
- `delete(id)` returns the removed semantic object; Undo restores its retained runtime instance and index.
- `observe()` returns `{ version: 1, boardId, viewport, selection: { ids }, objects }`. Each top-level semantic object has scene bounds. Formula renderer children, history, DOM and UI state are excluded.

## Identity, ink and positions

Create always generates fresh IDs, including Board Group descendants. Caller-provided `id` values are replaced. Formula is atomic: renderer children are not semantic objects.

The DrawBoard adapter applies board-default AUTO ink when `mathboardInkMode` is absent. Use `mathboardInkMode: 'fixed'` for explicit paint that must survive board theme changes. Formula uses one ink: fixed `fill` takes precedence over fixed `stroke`, and the chosen color is retained on the semantic root for replacement and reload. Selection chrome is runtime presentation, not controller semantics.

Coordinates may be omitted and Fabric defaults then apply. No auto-layout is promised. The next Semantic Auto-layout milestone will add measurement and placement between materialization and commit; use explicit coordinates in current adapters.

## Update boundary

Allowed transforms: `left`, `top`, `scaleX`, `scaleY`, `skewX`, `skewY`, `angle`, `flipX`, `flipY`, `originX`, `originY`.

Text additionally permits `text`, `fontSize`, `fontFamily`, `fontWeight`, `fontStyle`, `textAlign`, `lineHeight`, `charSpacing`, `underline`, `linethrough`, `overline`. Formula additionally permits `latex`.

Unknown patch fields are rejected. Style, intrinsic shape geometry, group children, identity and z-order updates are deferred because the current `modify` history snapshots do not cover them uniformly. Nested IDs can be observed but cannot be updated or deleted. Updating an ActiveSelection member first discards the selection to avoid local-coordinate writes.

## Integration and errors

The constructor receives `getCanvas`, `boardObjectPolicy`, `buildFormula` and `pushHistoryCommand`; optional callbacks provide history suppression, runtime decoration, selection-panel refresh and board ID. Formula UI create/edit routes through this same boundary; product analytics remains in DrawBoard. Other human gestures retain their existing Fabric/history paths.

Mutations emit local history commands. DrawBoard's history commit marks persistence dirty exactly once. The controller has no dependency on IndexedDB, analytics or Stamp, and no public `history: false`, networking, operation protocol or global `window` API.

`BoardControllerError.code` is one of `board_not_ready`, `invalid_object_spec`, `object_not_found`, `nested_object_mutation_not_supported`, `invalid_object_patch`, `formula_render_failed`, `board_commit_failed`. Programmable mutations reject an in-progress human Text edit with `board_commit_failed`, leaving its gesture history intact; finish editing before retrying. Formula materialization failure commits nothing; runtime/history commit failure rolls back canvas mutation.
