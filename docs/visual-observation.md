# Visual observation with Playwright

Generate synthetic full-workspace evidence from a clean test browser:

```sh
npm ci
npm run test:e2e -- e2e/visual-observation.spec.js --reporter=list,html
npx playwright show-report
```

Use the Node version in `.node-version` and install Chromium with `npm run test:e2e:install` if needed. Port 4173 must be free: do not reuse a preview server from another worktree. The command builds only `dist-e2e/`; never deploy it.

The report contains `circle-area-light-1280x800` and `circle-area-light-1024x768`, their repeated PNG captures, and environment JSON attachments. Raw files live in test-scoped directories under `test-results/visual-observation-*/`. Save artifacts before a subsequent Playwright run replaces its output. The reference viewport uses CSS pixels, device scale factor 1, and light UI/board themes. Each image includes the entire viewport, including the actual toolbar, without cropping to Fabric.

The existing CI workflow uploads `playwright-report/` and `test-results/` only on failure, with seven-day retention. Successful CI runs do not publish these files. Run the command locally for successful visual evidence; failure artifacts are available from the GitHub Actions run's `playwright-artifacts` download. Nothing uploads screenshots from this helper.

## Synthetic scenario and readiness

A framed explanation of circle area contains three text objects, a MathJax vector formula retaining editable LaTeX, and a circle. The frame and explanation start near the left toolbar: inspect the constrained viewport for the same occlusion and spacing risks found during agent-bridge dogfooding. Coordinates are deliberately fixed; this workflow does not implement positioning corrections or auto-layout.

Setup uses existing toolbar, canvas, text editor and formula modal actions. Capture starts after the expected six objects and nonzero vector formula children/geometry exist, dialogs/editors close, fonts finish, and Fabric has animation frames to paint. No fixed sleeps or capture-time board mutations are used. Tests compare objects, history, selection, zoom and viewport before and after observation. Two consecutive decoded images may differ in at most 0.1% of pixels (channel differences up to 8 ignored); there are no cross-machine golden images. Run twice for fresh-fixture reproducibility:

```sh
npm run test:e2e -- e2e/visual-observation.spec.js --repeat-each=2
```

## Human or agent review checklist

- Does the actual left toolbar remain visible, and does it cover any text, formula, or frame edge?
- Are all glyphs and geometry visible inside the viewport, without clipped exponents or fraction bars?
- Is the title distinct from the numbered steps, with consistent alignment and readable mathematical notation?
- Do text, formulas and the circle have enough spacing, without accidental overlap or narrow margins?
- Does the ink remain legible against the board and surrounding UI?
- Do both viewport sizes and repeated captures show the same complete explanation?

An attached image or passing consistency check proves neither good layout nor correct mathematics. Record an explicit visual judgment in the implementation review. Semantic observation remains authoritative for object state; the screenshot supplies evidence of rendered clipping, spacing, occlusion and contrast.

Only synthetic fixture content belongs in automated artifacts. Ad-hoc inspection of a real board requires explicit owner consent, local storage, and an agreed retention/deletion policy. No real student or tutor content is used here.
