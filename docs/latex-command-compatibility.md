# LaTeX command compatibility (Formula editor and board)

MathBoard intentionally uses **KaTeX** to preview and validate input in
`FormulaModal.vue`, then **MathJax 4 SVG** and **Fabric.js** to materialize
an editable vector formula on the board. Acceptance by the preview engine does
not automatically establish board support; the table below records a focused,
test-backed subset, not an exhaustive command guarantee.

The MathJax package set is explicit in
[`src/formulas/mathjaxBrowserEngine.js`](../src/formulas/mathjaxBrowserEngine.js).
Packages must be statically registered and enabled, with no CDN, runtime
`\require`, or arbitrary autoloading. Do not change the formula's LaTeX
source of truth or its semantic persistence format.

## Enabled packages

| Package | Board configuration | Example validated by KaTeX | Notes |
| --- | --- | --- | --- |
| `base` | Existing | `x^2` | Core TeX |
| `ams` | Existing | `\begin{bmatrix}a&b\\c&d\end{bmatrix}` | AMS constructs |
| `boldsymbol` | Existing | `\boldsymbol{\alpha}` | Regression for issue #124 |
| `newcommand` | Existing | `\newcommand{\foo}{x}\foo` | Isolate macros across formulas |
| `noundefined` | Existing | — | **Risk:** unknown commands can render as text rather than a failing `merror` |
| `textmacros` | Existing | `\text{Area}` | Text in math |
| `cancel` | Added in this PR | `A+\cancel{B}`, `\bcancel{x}`, `\xcancel{\frac{a}{b}}` | Rendered diagonal strike paths must survive SVG-to-Fabric conversion |
| `mathtools` | Added in this PR | `a\coloneqq b`, `\xhookrightarrow{f}` | Extra relations and extensible arrows |
| `extpfeil` | Added in this PR | `\xmapsto{f}`, `\xlongequal{definition}` | Extensible arrow commands |
| `braket` | Added in this PR | `\bra{\phi}`, `\ket{\psi}`, `\braket{\phi|\psi}` | Dirac notation |

The listed examples are part of the regression corpus (except the existing
package examples, covered elsewhere). A passing test establishes the named
examples only, not all macros/options provided by the package.

## Known asymmetries and explicit exclusions

| Command / family | KaTeX preview | MathJax board (with packages enabled) | MathBoard behavior |
| --- | --- | --- | --- |
| `\cancel{B}`, `\bcancel{x}`, `\xcancel{x}` | Supported | Supported by `cancel` | Intended to work; check both preview and Fabric paths |
| `\cancelto{0}{x}` | **Unsupported** | Supported by `cancel` | **Not available through the Formula modal** with current strict KaTeX validation |
| `\coloneqq`, `\xhookrightarrow` | Supported | Supported by `mathtools` | Intended to work for documented cases |
| `\prescript{a}{b}{X}` | **Unsupported** | Supported by `mathtools` | **Not available through the Formula modal** with current strict KaTeX validation |
| `\xmapsto`, `\xlongequal` | Supported | Supported by `extpfeil` | Intended to work for documented cases |
| `\bra`, `\ket`, `\braket` | Supported | Supported by `braket` | Intended to work for documented cases |
| `physics`, `mhchem` | Different macro/extension requirements | Not enabled | Deferred pending a separate proposal and compatibility review |
| `html`, `autoload`, `require` | Different or unsafe feature boundary | Not enabled | Deliberately excluded from MathBoard's controlled package policy |

Do not advertise MathJax-only commands as supported while the KaTeX modal
rejects them. Unsupported-but-valid KaTeX macros can currently pass preview
and become an incorrect MathJax `noundefined` fallback. That broader
validation/UX issue is tracked separately in
`AgentWorklog/mathboard/Specs/2026-11-02-formula-preview-board-parity-spec.md`.

## Verification

- Unit: `npm run test:unit` exercises both KaTeX acceptance and MathJax
  output, including a structural `menclose` check for the cancel variants.
- Browser: `npm run test:e2e` checks the KaTeX modal, Fabric vector
  materialization, cancellation editing, and undo/redo.
- Gate: `npm run lint`, `npm run build`, and
  `npm run assert:no-e2e-hook`.
- Manual QA still required: visually inspect diagonal strike and X strokes
  at normal/zoomed scale, theme recoloring, stamps/serialization, and offline
  dynamic NewCM font loading. Automated tests are not pixel-level proof.
- No change to the accepted KaTeX/MathJax dual-engine boundary in
  [ADR 0004](adr/0004-semantic-object-model-and-renderer-boundaries.md).

## References

- [KaTeX supported functions](https://katex.org/docs/supported)
- [KaTeX support table](https://katex.org/docs/support_table)
- [MathJax TeX extensions](https://docs.mathjax.org/en/latest/input/tex/extensions/index.html)
- Prior fix: [MathBoard issue #124](https://github.com/giacomobartoloni/mathboard/issues/124)
