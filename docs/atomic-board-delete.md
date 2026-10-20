# Atomic board deletion

`BoardController.deleteMany(ids)` removes top-level semantic objects in one transaction. `clear()` applies the same operation to all top-level objects. Both return detached removed nodes in canvas z-order (back to front), regardless of input order.

```js
const nodes = await board.createMany([
  { type: 'rect', left: 300, top: 200, width: 80, height: 50 },
  { type: 'formula', latex: 'x=1', left: 450, top: 200 },
])
await board.deleteMany(nodes.map(({ id }) => id))
// One UI Undo restores both objects, their IDs, geometry and original order.
await board.clear()
```

A nonempty operation records one existing `delete` command with retained `{ object, index }` entries. Undo restores the same runtime instances and Redo removes them again. Formula roots retain LaTeX, ink and editability; Board Groups retain their hierarchy and child IDs. Board identity, theme, zoom and persistence lifecycle remain intact. Successful deletion updates persistence through the existing history boundary.

An empty array or an empty board returns `[]` without a history commit, preserving the Redo tail. Both operations require a ready board and a stable interaction, including empty calls.

IDs must be unique nonempty strings in an array. Malformed arrays, sparse arrays and duplicate IDs reject with `invalid_object_spec`. Unknown IDs reject with `object_not_found`; nested Board Group child IDs reject with `nested_object_mutation_not_supported`. All IDs are validated before selection or canvas mutation. A mixed valid/invalid request changes nothing.

If removed roots belong to an ActiveSelection, the selection is discarded before removal so retained roots keep scene geometry. A runtime removal failure or rejected history commit restores roots in their original order and restores the previous selection and its transform. The DrawBoard adapter also restores the command log, cursor and coalescing marker if history notification throws after log mutation. Callers injecting their own `pushHistoryCommand` must provide the same atomic commit guarantee.

The existing `delete(id)` result remains one node. It continues to use its existing behavior.

## Local development bridge

```json
{ "method": "deleteMany", "params": { "ids": ["mbobj_a", "mbobj_b"] } }
```

```json
{ "method": "clear", "params": {} }
```

Send these requests to `POST /__mathboard_agent/command` in explicit local agent mode. Both operations are listed by [Local LLM API Help](local-agent-api-help.md) through the shared executable registry (`GET /__mathboard_agent/help`) with `mutatesBoard: true`, `requiresStable: true`, and parameters, errors and return schemas. Domain errors return HTTP 409. Only registered methods are accepted; other method strings reject with HTTP 400 `invalid_command`. The read-only `screenshot` command and its transport limits remain unchanged. UI Undo/Redo remain the existing human history controls. The bridge stays excluded from normal development and production builds.
