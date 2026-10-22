# Line endpoint editing (V1)

MathBoard's Select tool exposes two native Fabric controls when a **single top-level Line** is selected. Dragging either control changes that endpoint in scene coordinates while the other endpoint remains fixed. Dragging the line body continues to move the entire object. ActiveSelection and group children retain standard transform behavior.

## Geometry-handle extension contract

`src/board/geometry/geometryHandles.js` accepts an adapter with three operations:

- `handles`: ordered stable handle identifiers.
- `readHandle(object, id)`: current handle position in scene coordinates.
- `moveHandle(object, id, scenePoint, options)`: update intrinsic geometry and keep the intended anchor fixed; return whether anything changed. The controls pass the current `shiftKey` modifier in `options`.

The Fabric control layer owns control rendering, zoom-aware positions, hit targets, and cancellation checks. The Line adapter owns only the geometry and recentering. Future arrow and polygon editing should add their own adapters, **not** change the existing line semantics or introduce a new selectable canvas object.

### History

`before:transform` detects geometry controls; only then does `snapshotObject({ includeGeometry: true })` retain Line intrinsic endpoints. A completed drag pushes one existing `modify` command through the standard history path; a no-op does not. Ordinary object transforms continue to use transform-only Line snapshots, consistent with ADR 0001. Escape during a geometry drag restores the snapshot and cancels further handle mutations until pointer release.

### Persistence and limits

The existing `line` BoardDocument/Stamp schema already has four endpoint fields. The adapter retains object identity and ink; rendering controls are not serialized. V1 does not edit arrow, polygon, group children, multi-selection, or freehand paths. Shift-dragging a line endpoint constrains the visible scene-space angle around the opposite fixed endpoint to the nearest multiple of 15°, preserving the current pointer distance. Releasing Shift during the gesture returns to free endpoint movement. Positional snapping to grids or objects remains deferred.

Verify `npm run lint`, `npm run test:unit`, `npm run build`, `npm run test:e2e`, and interactive light/dark/chalkboard checks at multiple zoom levels on mouse and touch. See `tests/lineEndpointEditing.test.js` for transform, snapshot and serialization cases.
