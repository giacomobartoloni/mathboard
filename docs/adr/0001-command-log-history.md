# 0001. History is a command log

- Status: Accepted
- Date: 2026-09-28

## Context

Undo stored a full-canvas snapshot. `saveState` listened to `object:added`, `object:modified`, and `object:removed`, and each entry was `JSON.stringify(canvas.toObject(SERIALIZED_CUSTOM_PROPS))`, capped at 50. Undo parsed one entry, removed every object, called `enlivenObjects`, and added every object back.

On Fabric 6.9.1, fifty snapshots of a 1000-rectangle board held about 27.6 MB of text. Undo took about 300 ms, and almost all of that was removing the live objects, not parsing JSON. A formula bitmap was copied again into every later snapshot. A rectangle was snapshotted at 0×0, because `object:added` fires when the shape is created and `finishDrawingShape` did not snapshot again. Those numbers were not repeated after this change, and they are not Fabric 7 numbers.

Fabric 6.9.1 and Fabric 7.4.0 have no `saveState` and no `_stateProperties`. `FabricObject.stateProperties` only marks a parent dirty. Public `fabric-history` packages are the same full-canvas JSON stack (`toDatalessJSON` plus `loadFromJSON` or `clear`). The 2020 `TransformCommand` that calls `object.saveState()` is not a drop-in.

`transform.original` is also not an undo payload. On `before:transform`, Fabric stores scale, skew, angle, `left`, `top`, and flip of the gesture target. The origin on that record is the control corner, not the object's origin. When the target is an `ActiveSelection`, those fields describe the selection. Children are already in group space when the selection is created, and they are still there at `object:modified`.

`canvas.remove` on an `ActiveSelection` does not remove the children. The selection is not in `canvas._objects`.

In Fabric 7, `left` and `top` are origin-relative and the default origin is `center` / `center`. Serialized `type` is `constructor.type`. The instance `type` getter is deprecated; checks go through `isType`.

## Decision

One user gesture is one command, recorded at the gesture boundary. The log does not listen to `object:added`, `object:modified`, or `object:removed` as its source of history.

Add and delete keep the Fabric instance. Undo of an add removes that instance. Undo of a delete inserts it at the stored index. In-memory history does not call `enlivenObjects`. A persisted log would, because the instances would no longer be in memory.

A modify stores a whitelist and writes it back with `set` and `setCoords` on the same instance. It does not store `path`, image `src`, or filters, and it does not pass a full `toObject()` to `set`. `type` and `version` are not inputs.

The whitelist is:

- Every object: `left`, `top`, `scaleX`, `scaleY`, `skewX`, `skewY`, `angle`, `flipX`, `flipY`, `originX`, `originY`.
- Circle: also `radius`.
- Line, rect, and image: also `width` and `height`. Line endpoints are not stored. Setting `x1` / `y1` / `x2` / `y2` recenters the line and fights the saved position.
- Path: layout only. The path commands stay on the instance.
- Text: layout, `width`, `height`, and the text fields (`text`, `styles`, font, decoration, alignment, `lineHeight`, `charSpacing`). `styles` is cloned. `text` is applied before `width` / `height`, because `set("text")` recalculates dimensions.

While a child is inside an `ActiveSelection`, canvas-absolute fields are read with `util.sendObjectToPlane(object, group.calcTransformMatrix())`. The object is then put back with `set` of the fields the plane change wrote (`left`, `top`, scale, skew, angle, flip) and `setCoords`. A second `sendObjectToPlane` is not used: the inverse is not bit-exact, and a snapshot must not move the object. Undo of a modify discards the selection first. Absolute `left` / `top` written while the object is still in the group become group coordinates, and the object jumps.

Commands:

- Pencil. One `add` at `path:created`.
- Shape. One `add` in `finishDrawingShape`, including a click that leaves a 0×0 shape. The `canvas.add` at mouse-down is not a command. Switching tools closes the gesture first.
- Text. The `"Text"` placeholder is not a command. On `editing:exited`, an empty or unchanged placeholder is removed and nothing is recorded. Otherwise one `add` of the final text. A later edit snapshots on `text:editing:entered`. Fabric fires `object:modified` for that edit only when the string changed, and that event has no `transform`.
- Formula insert. One `add`. The bitmap stays on the instance.
- Formula edit. One `replace`. The old image stays until the new bitmap is ready. If the bitmap fails, nothing is recorded.
- Delete. One command for `getActiveObjects()`, with each canvas index. Discard the selection, then remove. Restore from the lowest index.
- Move, scale, rotate. Snapshot on `before:transform`, compare on `object:modified`, and record only objects whose whitelist changed.

The stack is capped at 50. A new gesture drops the redo tail. The stack is not in Vue `data()`, so the retained instances are not proxied. Theme ink updates (`syncAutoInk`) are not history.

## Consequences

- Undo no longer rebuilds the board, and a move no longer copies a stroke or a formula bitmap.
- The 0×0 rectangle is no longer a separate history entry. A click that never drags still records that 0×0 shape, because that is the gesture.
- Objects that are not retained by a command can be collected. Objects in the log cannot, until the entry falls off the cap of 50.
- Persisting the log is a different design. It needs serialization and `enlivenObjects` on load. This ADR does not cover it.
- Selective undo is out of scope. MathBoard undo is linear, last-in first-out.
- The Fabric 6.9.1 undo time was not remeasured after this change.

## Alternatives considered

- Full-canvas JSON. [alimozdemir/fabric-history](https://github.com/alimozdemir/fabric-history) and [anth0nycodes/fabric-history](https://github.com/anth0nycodes/fabric-history) push `toDatalessJSON()` on `object:added`, `object:removed`, and `object:modified`, then `loadFromJSON`. Same family as the old `saveState`. A slim snapshot (`includeDefaultValues: false`) cut one 1000-rectangle snapshot by about 3.5× and did not change undo time. Paths, text, and formulas were not round-tripped. It does not fix the 0×0 snapshot. The copied thread is [Stack Overflow 22338080](https://stackoverflow.com/questions/22338080/undo-redo-for-fabric-js).
- Interned object blobs plus a stack of id lists. A formula bitmap would be stored once. Undo would still rebuild the board, so the remove cost would stay. A JSON diff of successive `toObject()` results is this family.
- `saveState` / `_stateProperties`, and the 2020 `TransformCommand` on [Stack Overflow 61459711](https://stackoverflow.com/questions/61459711/fabricjs-implementing-undo-redo-on-canvases). Both symbols are absent in 6.9.1 and 7.4.0. The maintainer rejected `saveState` for undo because it shares nested references such as `filters` ([fabric.js#6452](https://github.com/fabricjs/fabric.js/issues/6452), 2020-07-19) and because `toObject()` is not an input to `set()` for an object in group coordinates ([fabric.js#6799](https://github.com/fabricjs/fabric.js/issues/6799), 2021-01-10).

Gamma, Helm, Johnson, and Vlissides (*Design Patterns*, 1994) separate a Command, which stores the operation and enough data to reverse it, from a Memento, which stores a snapshot. Berlage (*A Selective Undo Mechanism for Graphical User Interfaces Based on Command Objects*, ACM TOCHI 1(3), 1994) is the survey for graphical editors. Myers and Kosbie (*Reusable Hierarchical Command Objects*, CHI 1996) match this board: a gesture is one command. Selective undo is out of scope.

## Implementation

`src/history/commandLog.js` and `src/components/DrawBoard.vue`, on `perf/session-profiling` after the Fabric 7.4.0 merge (`12c61cd`).
