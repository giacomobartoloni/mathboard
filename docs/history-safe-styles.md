# History-safe style updates

`BoardController.update(id, patch)` accepts bounded style fields alongside existing transforms and Text content. Each effective update records one command. No-op updates preserve Redo history. Invalid patches reject before mutation with `invalid_object_patch`.

| Semantic object | Accepted style fields |
| --- | --- |
| Shape, Stroke, Text | `stroke`, `fill`, `strokeWidth`, `opacity`, `strokeDashArray`, `strokeLineCap`, `strokeLineJoin`, `mathboardInkMode` |
| Board Group | `opacity` |
| Formula | `fill` or `stroke` for one ink, `opacity`, `mathboardInkMode` |

Primitive paint is a string or `null`; no-paint surfaces remain transparent. Width and dash values must be finite and nonnegative; `strokeDashArray: null` removes dashes. Opacity ranges from 0 to 1. Caps are `butt`, `round`, `square`; joins are `bevel`, `round`, `miter`. Arrays are copied at input, snapshot and restoration boundaries.

Explicit paint implies `mathboardInkMode: 'fixed'` unless the patch supplies a mode. FIXED paint stays exact across themes and reload. AUTO resolves board-default ink in the current theme, including after Undo/Redo; theme changes add no history. Group opacity changes never recursively recolor children.

```js
await board.update(rect.id, {
  stroke: '#1864ab', fill: null, strokeWidth: 4,
  strokeDashArray: [8, 3], strokeLineCap: 'round', opacity: 0.7,
})
await board.update(rect.id, { mathboardInkMode: 'auto' })
```

Formula paint is one painted, nonempty color string; `null`, `none` and `transparent` reject. Use opacity to hide a Formula. An explicit `fill` patch wins over an explicit `stroke` patch. Otherwise a `stroke` patch replaces any previous semantic fill and becomes the new canonical fill. The semantic root and painted vector surfaces agree.

```js
// Existing blue fill becomes red; LaTeX and paint share one Undo command.
await board.update(formula.id, { stroke: '#c92a2a', latex: 'x=2', opacity: 0.8 })
```

Formula paint/mode or LaTeX updates render off-canvas and use the existing retained `replace` command, preserving ID, transform and z-order. Opacity-only changes use `modify`. Renderer or history failure restores prior scene and visible paint. Snapshot history contains bounded primitive styles and ink metadata; Formula history retains semantic Formula instances, without persisting renderer path soup.

The local development HTTP bridge uses its existing `update` method and the same validation. No new protocol method or arbitrary Fabric patch is exposed. Intrinsic geometry, nested mutation, hierarchy and z-order patches remain unsupported.
