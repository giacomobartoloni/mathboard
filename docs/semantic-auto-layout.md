# Measured semantic layout

Use `measure(id)` to read a top-level object's detached scene axis-aligned bounds. Formula geometry is measured after materialization. Pan/zoom never alters scene units. For a temporary ActiveSelection, measurement uses the equivalent committed scene transform; this avoids conservative skew-box inflation that would otherwise corrupt gaps. Runtime geometry and history are restored before the read returns. `observe()` keeps its existing contract.

```js
const nodes = await board.createMany([
  {type: 'text', text: 'Completing the square', fontSize: 30},
  {type: 'text', text: 'Add nine to both sides', fontSize: 22},
  {type: 'formula', latex: 'x^2+6x+9=16'},
  {type: 'text', text: 'Factor the perfect square', fontSize: 22},
  {type: 'formula', latex: '(x+3)^2=16'},
])
const result = await board.layout({ids: nodes.map(n => n.id), direction: 'stack', gap: 24, margin: 32})
const answer = board.measure(nodes.at(-1).id)
await board.create({type: 'rect', left: answer.left-12, top: answer.top-12,
  width: answer.width+24, height: answer.height+24, fill: null,
  stroke: '#16803b', mathboardInkMode: 'fixed'})
```

Layout options are `ids`, `direction` (`stack` default or `row`), `gap` (default24 scene units), `margin` (default16 viewport CSS pixels), and optional scene `left`/`top` for the first rendered bound. Caller ID order defines arrangement; it does not change z-order. Cross-axis alignment is at the start. There is no automatic resizing, grouping or new object creation. Frames use measured final extents; because a newly created frame is frontmost under existing hit testing, edit the underlying formula before adding it or select it through the existing object workflow.

DrawBoard supplies a conservative rectangular area clearing visible logo, left rail and open tool/color popovers, footer/zoom/support controls and cookie banner. Layout reads overlays at invocation; rerun it after changing viewport or visible UI. The controller contains no DOM code. Tests or other adapters can inject `getLayoutSafeArea(canvas)` returning a viewport CSS rectangle. An adapter omitting the callback defaults to the entire canvas before margin.

Layout requires a stable board. Empty/duplicate/malformed IDs, nested IDs, nonfinite values, negative gaps/margins, invalid directions/options and overflow reject without a partial command. Zero movement is a no-op, preserving Redo; floating-point residue below1e-7 is treated as zero. One nonempty layout records a single existing modify command; Undo/Redo restore all moved roots, IDs, origins and formulas. Temporary selections involving moved roots are discarded on success and restored on failure. Pan/zoom matrices are supported; rotated/sheared viewports are rejected.

Development bridge requests use the existing `POST /__mathboard_agent/command`:

```json
{"method":"measure","params":{"id":"mbobj_example"}}
{"method":"layout","params":{"ids":["mbobj_title","mbobj_formula"],"direction":"stack","gap":24,"margin":32}}
```

`layout` returns `{objects,bounds,safeArea}` with detached observed nodes, union rendered bounds and scene safe rectangle. Validation errors use existing domain error responses. Normal dev and production builds do not expose the HTTP bridge. E2E wrappers remain confined to `e2e/instrumentation/`.

Run `npm run test:agent-bridge` for the synthetic derivation, formula editing, one-step Undo/Redo, zoom/pan, overflow/Redo preservation and real cookie/submenu cases. `npm run test:e2e` verifies the built app boundary too. F017's existing capture helper is reused in a separate temporary integration validation checkout when its unmerged branch is available; this feature does not copy that workflow. See the vault Activity for exact artifacts, explicit dependency and visual judgment. A passing image comparison does not establish correct mathematical composition.
