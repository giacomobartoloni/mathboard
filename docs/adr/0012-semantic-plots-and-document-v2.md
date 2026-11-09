# 0012. Semantic plots and conditional BoardDocument v2

- Status: Accepted for the F039 implementation increment
- Date: 2026-11-03

## Context

A function graph must preserve editable mathematics rather than serialized path
samples. The G1 engine establishes a bounded LaTeX subset and segmented sampling.
BoardDocument v1 and Stamp v1 use closed type registries; adding plot silently to
v1 would break older readers. The owner authorized the user-facing graph workflow
following G1 review. Agent/MCP authoring remains a separate increment.

## Decision

1. A plot is an atomic semantic object, classified before Board Group. It stores
   original LaTeX, syntax `latex-v1`, mathematical window, intrinsic frame, axes,
   grid and curve color, stable ID and board transform. Samples/paths/AST are derived.
2. Keep writing BoardDocument v1 for scenes without plots. Write v2 if any plot
   occurs recursively inside groups. The new reader accepts v1 and v2; v1 with a
   plot is rejected explicitly. No destructive rewrite or IndexedDB upgrade is
   required. Legacy clients reject v2 as unsupported instead of misinterpreting it.
   Removing all plots permits serialization as v1 again because its nodes fit v1.
3. Stamp v1 remains unchanged. Exporting any plot-containing selection, including
   nested plots, fails with an explicit message. It never degrades to paths.
4. Materialize plots through the central semantic materializer using a lazy plot
   renderer, covering active/inactive boards and reload without per-service forks.
   The public agent discovery type register is kept separate from the expanded
   internal semantic register; this increment does not advertise plot authoring.
5. Build replacements off-canvas, then reuse the existing atomic BoardController
   replace command with lifecycle checks, stable identity and current transforms.
   Failed builds keep the previous object, history and selection. Undo/redo retains
   the complete previous/next semantic objects. Registered Fabric cloning rebuilds
   plots from semantics, also inside groups.
6. Browser calculations run in a lazy module Worker with structural/work budgets,
   abort and a 10-second termination deadline. Stale preview requests are cancelled.
   Preview and board consume the same clipped geometry. No dynamic code generation
   or runtime CDN is required. Headless Node tests use the same computation module.
7. AUTO ink follows board theme through explicit PlotObject paint traversal.
   Fixed curve color is preserved. Plot internals cannot be ungrouped directly.

## Consequences

The source of truth remains mathematical and editable after reload and duplication.
New plot documents require a current client. Sharing plots as stamps is deferred.
The Cortex package remains a substantial lazy worker asset; first-use transfer and
slow-device behavior need release-level observation. Finite sampling is conservative
and may miss narrow domains or oscillation; unresolved intervals remain gaps.

## Follow-up — 2026-11-06 (F039 G4 source implementation)

The separate F039 G4 branch extends the existing agent/MCP command registry to
advertise semantic `plot` in `create`, `createMany`, `update` and `observe`,
without creating Plot-specific methods. A closed public input boundary separates
new agent-created Plot fields from historical BoardDocument nodes. A shared,
request-scoped rendering seam carries cancellation and the remaining native/dev
deadline through active and inactive materialization.

This is an additive follow-up, **not** a reversal of the original UI increment
or a new document/IPC version: conditional BoardDocument v2, Stamp v1 rejection,
semantic history and persisted mathematical source remain unchanged. Native
packaged-client acceptance is a separate G4.4 gate; source changes alone do not
establish a shipped capability. See the G4 AgentWorklog implementation plan.

## Follow-up — 2026-11-08 (transparent graph background)

The owner requested an opt-in transparent graph surface. The optional semantic
boolean `transparentBackground` defaults to false for new and historical plots
and does not change conditional BoardDocument v2 or Stamp v1. The runtime
retains a frame-sized Fabric surface to preserve bounds; when enabled its fill
is transparent so the board and its grid remain visible. Plot Axes, Grid and
Border stay independent. Theme changes recolor ink but never make the transparent
surface opaque. UI, local agent and native MCP use one canonical Plot property;
public create/update discovery validates it without adding a new tool or
allowing arbitrary background paint.

Delivery is stacked as PR #150 (plot foundation), PR #156 (UI and persistence),
then PR #152 (local-agent/MCP integration). This decision does not imply merge,
deployment or installed-client acceptance.
