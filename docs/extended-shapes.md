# Extended semantic shapes

Programmable shapes use the scene-origin contract in [semantic positioning](semantic-positioning.md). UI tools and shortcuts remain unchanged; the legacy UI shape ID `arrow` still draws a semantic `line` without an arrowhead.

## Ellipse

```js
await board.create({ type: 'ellipse', rx: 140, ry: 95, left: 200, top: 220,
  stroke: '#1565c0', fill: '#cce5ff', mathboardInkMode: 'fixed' })
```

Both radii are required, finite and nonnegative; zero is accepted. Existing transform updates move, scale or rotate the retained shape without changing its intrinsic radii. BoardDocument preserves identity; Stamp copies receive fresh identity on import. Both formats remain version 1 with additive object types: existing documents remain readable, older readers reject unknown new types explicitly.

For new shapes, AUTO recolors every painted stroke/fill to current board ink. Null, `none` and `transparent` surfaces remain unpainted. FIXED preserves distinct stroke and fill colors. Existing primitive ink behavior remains unchanged. Palette changes apply the same new-shape painted-surface policy and preserve undo metadata.

Run `npm run test:agent-bridge -- e2e-agent/semantic-ellipse.spec.js` for synthetic whole-viewport Venn evidence, history, themes and persistence. Artifacts live in the test output directory; no real lesson content is captured.

## Polygon

```js
await board.create({ type: 'polygon', left: 220, top: 180,
  points: [{ x: 0, y: 0 }, { x: 180, y: 0 }, { x: 0, y: 140 }],
  fill: '#fff0aa', stroke: '#1565c0', mathboardInkMode: 'fixed' })
```

Three to 1000 finite `{x,y}` vertices define the closed intrinsic geometry. Points may include negative coordinates. They remain unchanged by object transforms: Fabric derives its centered `pathOffset`, while `left/top` locate the selected object origin against the geometry bounds. When position is omitted, the supplied point extents establish intrinsic placement. Returned points are detached; changing them does not edit the board. Point editing through update is outside V1. A polygon is one native atomic shape, never a group of line segments, and its independently colored FIXED interior survives document and Stamp round trips.

Run `npm run test:agent-bridge -- e2e-agent/semantic-polygon.spec.js` for the filled-triangle browser scenario.
