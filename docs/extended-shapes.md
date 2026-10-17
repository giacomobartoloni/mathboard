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
