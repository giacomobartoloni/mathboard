# Programmable grouping

`await controller.group(ids, { select: false })` binds at least two existing
objects into one Board Group and returns its detached semantic tree. The local
development HTTP bridge accepts `{ method: 'group', params: { ids, options } }`.

```js
const composite = await controller.group([sideA.id, sideB.id, sideC.id, label.id])
await controller.update(composite.id, { left: 350, top: 200, angle: 15 })
```

IDs must be distinct, nonempty strings naming top-level groupable objects.
Unknown IDs and nested IDs reject the entire request before mutation. Existing
Board Groups cannot be grouped again in this version. Formulas remain atomic
LaTeX-backed objects and can be grouped with shapes, strokes or text.

Children are ordered by canvas z-order, independently of the input ID order.
The composite is placed at the front, matching UI grouping. For noncontiguous
roots, this brings previously lower members in front of ungrouped objects.
Its origin is explicitly left/top; each child's visible scene geometry remains
unchanged. Child coordinates in the returned tree are group-local, as described
in [semantic positioning](semantic-positioning.md).

The group receives a fresh stable MathBoard ID; all descendants retain theirs.
The implementation keeps the original Fabric instances, formula vectors, ink
modes and line endpoints. One existing retained `group` history command records
the operation. Undo restores roots at their original indexes; Redo restores the
same composite and children. Move/scale/rotate uses normal modify history.

By default an intersecting ActiveSelection dissolves into scene coordinates.
An unrelated active object or selection stays selected. `{ select: true }`
selects the new group. Runtime/history commit failures restore original root
order, transforms, IDs, and the previous selection plane; no partial group is
committed. Mutations during an unfinished gesture are rejected as usual.

Descendants remain readable through `get`/`observe`, while direct nested updates
and formula editing through the controller remain unsupported. Select the group
and use existing UI Ungroup (Ctrl/Cmd+Shift+G) to expose editable formula roots.
BoardDocument Save/Open preserves the hierarchy and IDs; AUTO ink follows board
themes and FIXED ink stays explicit.

This feature builds on F014 positioning and F015 transactional history callback
handling. The F014 and F015 foundations have been merged into `develop`; this
review branch is aligned with that foundation and targets `develop` directly.
The read-only `GET /__mathboard_agent/help` method registry advertises
`group` only in builds containing this implementation, including validation,
history effects and examples. The development bridge remains excluded from
normal development and production output.
