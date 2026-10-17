# Programmable object positioning

`BoardController.create` and `createMany` default omitted `originX` and `originY`
to `left` and `top`, for every semantic type and recursively inside new groups.
Explicit named origins (`left`/`center`/`right`, `top`/`center`/`bottom`) and
finite numeric origins are preserved independently on each axis, including
BoardDocument and Stamp round trips. Both formats validate axis-specific names
or finite numeric origins.

For a top-level object, `left` and `top` locate that origin in scene coordinates.
Pan and zoom only change the viewport; they never rewrite scene positions.
`observe().objects[].bounds` reports the axis-aligned rendered scene rectangle,
including stroke and object/selection transforms. With rotation, skew or a
center origin, its corner differs from the object's `left`/`top`.

```js
const formula = await controller.create({
  type: 'formula', latex: '(x+3)^2=16', left: 180, top: 400,
})
// Formula, text and rectangle now share left/top defaults.
```

Do not set `left`/`top` merely to zero for a line or path whose coordinates
already establish placement. When omitted, Line endpoints and Path commands
retain their intrinsic scene placement. Explicit `left`/`top` move their origin;
they do not replace endpoints or path commands.

Group input child coordinates describe relative layout. The existing Fabric
Group constructor computes child extents, centers its local plane and translates
child positions into that plane. Readback child coordinates are group-local;
reuse the complete returned tree, including the container transform, when
recreating a group. A top-level group origin positions the container. Temporary
ActiveSelection members are instead returned in scene coordinates. Formula
objects stay atomic LaTeX nodes; their renderer paths are never exposed as group
children. Nested mutations remain unsupported.

Updates preserve existing origins unless the patch changes them. An origin-only
update keeps numeric `left`/`top`, so it can move the rendered shape. Supply the
intended coordinates along with an origin change. Formula rerendering and
Undo/Redo preserve these explicit transforms.

The defaults apply only at the programmable creation boundary. UI creation,
BoardDocument opening and Stamp materialization keep their previous defaults and
explicit origins. There is no document migration or global Fabric default
change. To duplicate an observed object exactly, retain its explicit origins.

For mixed prose/formula layouts, use a safe scene margin and measured bounds to
place frames or compute gaps. Uniform origins remove a source of drift; text and
formula heights still depend on content. This contract does not provide automatic
layout or detect clipping behind floating interface controls.
