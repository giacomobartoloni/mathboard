# 0004. Semantic object model and renderer boundaries

- Status: Accepted
- Date: 2026-10-06

## Context

MathBoard treats Fabric.js as the interactive canvas runtime. Product meaning (Formula, Text, Stroke, Shape, Board Group, Selection) was inferred ad hoc from Fabric types and duplicated markers (`formulaType === 'katex-formula'`, `objectKind`, local `isFormula` helpers) across `DrawBoard.vue`, `selectionActions.js`, `colors.js`, and stamp serialization.

Board formulas are atomic vector `FormulaObject` instances (`Group` of MathJax SVG paths) with legacy `formulaType === 'katex-formula'`. If selection, ink traversal, and Stamp answered “what is this?” with `object.isType('Group')` alone, a Formula Group would be offered Ungroup, lose Edit, and expose child paths to the ink palette.

Formula rendering is isolated behind `MathJaxSvgFormulaRenderer` (MathJax SVG → Fabric vectors + `applyInk`). `DrawBoard` orchestrates create/edit/stamp/theme workflows and does not own MathJax or Fabric SVG parse details. KaTeX remains only for FormulaModal preview/validation.

Stamp transfer already serializes formulas as semantic `{ type: 'formula', latex }` nodes (ADR 0003). Detection of those nodes at export time still lived locally in the serializer.

Vue reactivity and Fabric identity remain a hard constraint: Fabric instances and application services must not become reactive proxies (`markRaw`, services outside `data()`). See `tests/vueFabricProxy.test.js`.

## Decision

1. Fabric remains the runtime interaction and geometry state for now. It is not the product semantic model.
2. MathBoard semantics are separate from Fabric runtime class/type. `Fabric type != MathBoard semantic type`.
3. `BoardObjectPolicy` owns classification (`kindOf`, `isFormula`, `isBoardGroup`, …) and capability lookup. Formula classification precedes Group.
4. Formula rendering is an adapter boundary (`MathJaxSvgFormulaRenderer`). `DrawBoard` orchestrates create/edit/stamp/theme workflows and does not implement MathJax typesetting or Fabric SVG parse details. KaTeX stays in FormulaModal only.
5. LaTeX remains the source of truth for formulas. Renderer output is a presentation artifact (vector paths, not a persistence format).
6. Persistence (Stamp today; future documents) stores product semantics, not renderer artifacts (no MathJax path soup as source of truth). Stamp may still carry legacy `mathboardRenderedInkIsLight` for compatibility; rematerialization must ignore that polarity — AUTO formulas apply destination board ink via `applyInk`. Formula detection is intentionally hardened: `latex` alone is not a semantic discriminator (`formulaType`, or `objectKind` + `latex`).
7. Board Formula is `FormulaObject extends Group`. Product commands that decide board-group behavior (for example `ungroupSelection`) must use `BoardObjectPolicy.isBoardGroup()`, not Fabric `isType('Group')` alone.
8. No parallel canonical BoardDocument runtime in this horizon.
9. No tactical DDD ceremony (DI container, repository layer, domain events, CQRS) without a concrete need.
10. Application services are composed in `app-bootstrap.js` (`createMathBoardServices`) and provided via Vue `provide`/`inject`. Services stay outside `data()`.
11. Fabric instances must not cross a Vue reactive boundary as proxied objects.
12. E2E observability stays outside production `src/`; instrumentation belongs in `e2e/instrumentation/`.

Capability flags describe whether an object may participate in an operation. They do not automatically drive contextual UI buttons (e.g. Formula is groupable, but a single-formula panel does not show Group).

## Consequences

Positive:

- MathJax SVG landed behind the formula renderer adapter without rewriting selection, colors, Stamp detection, or DrawBoard formula infrastructure.
- Selection, theme ink walks, and Stamp export stay correct for Formula Groups.
- Formula failures stay technical (`FormulaRenderError`) while DrawBoard decides application response (analytics, leave previous formula in place on edit failure).

Costs:

- A new semantic layer and a small indirection for callers.
- Runtime remains Fabric-centric; there is still no independent document model.
- Vector formulas may contain many Fabric Path children (`fontCache: 'none'`); measure before optimizing.

## Alternatives considered

- Keep everything in `DrawBoard`. Rejected: MathJax would remain a board-wide rewrite.
- Full DDD / DI rewrite. Rejected: ceremony without payoff at this scale.
- Introduce a canonical BoardDocument runtime now. Rejected: synchronization cost is not justified before Save/Open.
- Subclass every Fabric object. Rejected: decorative inheritance without behavior.
- Temporary `FormulaObject extends FabricImage`. Rejected: would force a second superclass change when SVG Group lands.

## Implementation

- `src/board/BoardObjectPolicy.js`, `src/board/capabilities.js`
- `src/formulas/constants.js`, `FormulaRenderError.js`, `FormulaObject.js`, `MathJaxRuntime.js`, `MathJaxSvgFormulaRenderer.js`, `mathjaxBrowserEngine.js`
- `src/core/createMathBoardServices.js`, `src/core/serviceKeys.js`
- Call sites: `DrawBoard.vue`, `selectionActions.js`, `colors.js`, `stamps/serialize.js`
- Composition root: `src/app-bootstrap.js`
- Regression coverage: `tests/boardObjectPolicy.test.js` and existing selection/colors/stamp suites
