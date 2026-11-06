# F039 G1 plotting spike

This directory is an isolated Phase A/B prototype. It is not imported by the
application. There is no Fabric renderer, persistent plot type, editor or MCP API.
Review the G1 findings before adopting this contract.

- `parsePlotExpression(latex)` preserves `latex`, returns `normalizedLatex`,
  diagnostic `mathJson`, `evaluate(x)` and internal continuity guard values.
  CortexJS 0.173.0 parses with `canonical:false`; an explicit bounded IEEE-754
  interpreter evaluates the accepted AST. It does not use Cortex compilation.
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
other variables, arbitrary macros, matrices, integrals, sums, factorials,
indexed roots/logs and unsupported MathJSON representations/operators/arities.
Negative fractional powers follow `Math.pow`: a real cube root of a negative
number is not supported. `0^0`, nonfinite values and invalid child domains
propagate NaN; symbolic cancellation never fills a hole.

Input limits: 2048 characters, balanced delimiter nesting <=32, numeric digit
runs <16. AST/interpreter construction: <=256 visits (including guards), depth
<=32 and variadic arity <=64. These bounds do not establish a hard parser timeout.
The engine is reused; no user assignments or stateful AST operations are accepted.

Default sampling: 64 initial intervals, 10 subdivision levels, 16385 evaluations
and 16385 output points. Hard maxima: 1024 intervals, depth 12, 32769 evaluations
and points. Tolerance is midpoint error divided by fixed mathematical y-span
(default 0.001), independent of board zoom. Finite ordered bounds are within
+/-1e12. Frames have positive finite dimensions <=16384 with representable scales.
Typed `PlotError.code` distinguishes invalid/unsupported expression, invalid
domain, computation limit and evaluator failure. The public contract is provisional.

## Known limitations

Finite deterministic probes can miss high-frequency oscillations, narrow domain
islands and compound zero sets not exposed by the conservative AST guards.
Midpoint error is not a continuity proof. Guards inspect denominator factors,
tangent cosine and sqrt/log/power domain factors; they may split continuous
curves too. Unresolved intervals remain gaps, never guessed chords. Samples
retain mathematical y values outside the window; rendering must clip them.

Parsing remains synchronous. The diagnostic worker proves module loading,
evaluation and termination, not a hard deadline/cancellation design or UI
responsiveness. Production integration needs an explicit loading/worker decision:
the full Cortex dependency has substantial standalone bundle cost.

Run `node --test tests/plot*.test.js` for the mathematical corpus,
`node --disallow-code-generation-from-strings --test tests/plot*.test.js` for the
Node code-generation restriction, and `node tools/benchmark-plot-spike.mjs` for
Node timings, Vite bundle size, strict CSP Chromium and module-worker smoke.
The benchmark needs the lockfile's Playwright Chromium (`npm run test:e2e:install`).
It writes only to the OS temporary directory and does not alter production entrypoints.
