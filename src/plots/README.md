# Editable function plots

Press G or select Graph, then click the board to choose the upper-left origin.
That click opens the lazy `PlotModal` editor. It previews LaTeX,
axis ranges, axis lines and numbers, grid, border, transparent background and curve color, then awaits an atomic board commit.
Successful insertion returns to Select; Escape cancels placement or the editor.
Double-click a plot or use Edit graph to change it. Board zoom leaves its math
window unchanged. Local-agent and MCP authoring reuse the same semantic Plot contract
through the merged F039 G4 implementation.

- `parsePlotExpression(latex)` preserves `latex`, returns `normalizedLatex`,
  diagnostic `mathJson`, `evaluate(x)` and internal continuity guard values.
  CortexJS 0.173.0 parses with `canonical:false`; an explicit bounded IEEE-754
  interpreter evaluates the accepted AST. It does not use Cortex compilation.
- `preparePlotExpression(latex, parameterSymbols)` parses and validates an approved
  set of local MathJSON symbol leaves once. Its `bind(values)` method snapshots
  finite numeric values immutably and returns the legacy `evaluate(x)` and
  `continuityGuards(x)` interface. Neither LaTeX text substitution nor shared
  CortexJS assignment occurs. Both evaluation and guards use the same snapshot.
  This is available for parameter-aware Plot creation and local-agent/MCP edits;
  it does not provide on-board sliders (separate follow-up).
- `samplePlot(expression, window, options)` returns mathematical `segments`, a
  copied `domain`, `diagnostics` and `status`. Status is `ok`, `partial`,
  `no_real_samples` or `computation_limit`. `partial` means some intervals were
  unresolved. `no_real_samples` does not prove that the real domain is empty.
  Singleton segments preserve observed finite boundary points without a chord.
- `createPlotTransform(window, frame)` maps mathematical coordinates to local
  pixels and back, flips y and exposes whether scales are isotropic. It does not
  change the window to fit the frame. Board transforms and viewport projection
  belong to the caller and never affect sampling.
- `clipMathSegment(a, b, window)` clips one already accepted mathematical chord.
  Apply clipping separately within each segment; never join across gaps.

## Grammar and budgets

Accept bare expressions and explicitly strip a leading `y=` or `f(x)=`.
Support finite numeric literals, x, Euler's e, pi, arithmetic, implicit
multiplication, parentheses, fractions, square roots, sin/cos/tan, exp,
base-10 log and natural ln. Trigonometry uses radians. Reject equations,
undeclared variables, arbitrary macros, matrices, integrals, sums, factorials,
indexed roots/logs and unsupported MathJSON representations/operators/arities.
Negative fractional powers follow `Math.pow`: a real cube root of a negative
number is not supported. `0^0`, nonfinite values and invalid child domains
propagate NaN; symbolic cancellation never fills a hole.

Input limits: 2048 characters, balanced delimiter nesting <=32, numeric digit
runs <16. AST/interpreter construction: <=256 visits (including guards), depth
<=32 and variadic arity <=64. These bounds do not establish a hard parser timeout.
The engine is reused; no user assignments or stateful AST operations are accepted.

Plot-local parameters are an optional variable-length array of records with
`symbol`, `value`, `min`, `max`, `step`. Single-letter and compatible longer
ASCII symbol identifiers are checked against parsed MathJSON and reserved
names; symbols must be unique and actually referenced by the expression.
Finite real values and slider bounds are limited to +/-1e12; each slider
has a practical 10000-tick budget. The parameter collection is bounded by
the existing 256 interpreter-visit resource policy, **not** by three sliders.
Any unused or undeclared symbol, malformed range or nonfinite binding rejects
without changing the original source expression.

Default sampling: 64 initial intervals, 10 subdivision levels, 16385 evaluations
and 16385 output points. Hard maxima: 1024 intervals, depth 12, 32769 evaluations
and points. Tolerance is midpoint error divided by fixed mathematical y-span
(default 0.001), independent of board zoom. Finite ordered bounds are within
+/-1e12. The mathematical transform accepts positive finite dimensions <=16384; persisted
plot frames are restricted to 80..2048 with representable scales.
Typed `PlotError.code` distinguishes invalid/unsupported expression, invalid
domain, computation limit and evaluator failure. The plot schema also fixes syntax to latex-v1 and validates the display flags and curve color.

## Known limitations

Finite deterministic probes can miss high-frequency oscillations, narrow domain
islands and compound zero sets not exposed by the conservative AST guards.
Midpoint error is not a continuity proof. Guards inspect denominator factors,
tangent cosine and sqrt/log/power domain factors; they may split continuous
curves too. Unresolved intervals remain gaps, never guessed chords. Samples
retain mathematical y values outside the window; rendering must clip them.

`computePlotAsync` owns a module Worker for each browser request. Cancelling a
preview terminates its worker; a 10-second deadline terminates unfinished work.
Parsing is synchronous within that worker. The full Cortex dependency remains a
large lazy asset; slow-network and low-end-device acceptance remain release checks.
Node tests use the same computation module directly.

`computePlot` produces clipped paths and isolated points shared by the preview
and Fabric renderer. `PlotObject` is an atomic registered Fabric Group; clones
rebuild from semantics. AUTO curve/decorations follow board ink; fixed curve
colors preserve the curve while decorations continue following board theme.
By default a solid surface in the board background color masks the underlying board grid,
even when the graph grid or border is disabled. Selecting Transparent background reveals
the underlying board (including its grid), independently of the graph's Axes, Grid and Border.
The boolean `transparentBackground` is stored semantically and defaults to false for older
plots; theme changes never make a transparent plot opaque. Border is enabled by default for
new graphs and older plot nodes without the optional boolean `border` field.
The mathematical grid omits perimeter strokes, so enabling it cannot add a border.
Axis numbers can be hidden independently while keeping the axis lines. The optional
boolean `axisNumbers` defaults to true for older plots. Hiding Axes also hides the
numbers while retaining the stored preference for when Axes is enabled again.
`applyTheme` updates this surface separately from ink; preview and board use the
same theme colors.
The runtime-only plotBoardInk and plotBoardBackground fields preserve theme
presentation through clone; both are excluded from BoardDocument source semantics
and derived again from the destination board theme on reload.

BoardDocument v1 is emitted for plot-free scenes, v2 for scenes with only
parameterless Plots, and conditional v3 for any Plot with a nonempty parameter
array, recursively inside groups. Older v2 readers reject v3 rather than
silently discarding numeric bindings. Committed values and range settings are
semantic; MathJSON AST, samples, transient previews and derived Plot status
are not persisted. Parameterized Plots with no real samples in the selected
window render a valid empty graph with derived `no_real_samples` status;
parameterless Plots retain their previous rejection of such input.
Stamp v1 still rejects plot sharing. See [ADR 0012](../../docs/adr/0012-semantic-plots-and-document-v2.md)
and the proposed [ADR 0013](../../docs/adr/0013-plot-parameters-and-document-v3.md).

Run `node --test tests/plot*.test.js` for the mathematical corpus,
`node --disallow-code-generation-from-strings --test tests/plot*.test.js` for the
Node code-generation restriction, and `node tools/benchmark-plot-spike.mjs` for
Node timings, Vite bundle size, strict CSP Chromium and module-worker smoke.
The benchmark needs the lockfile's Playwright Chromium (`npm run test:e2e:install`).
It writes only to the OS temporary directory and does not alter production entrypoints.
