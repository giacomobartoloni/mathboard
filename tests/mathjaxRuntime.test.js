import test from 'node:test'
import assert from 'node:assert/strict'
import katex from 'katex'
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js'
import { createMathJaxEngine } from '../src/formulas/mathjaxBrowserEngine.js'
import { MathJaxRuntime } from '../src/formulas/MathJaxRuntime.js'
import { FormulaRenderError } from '../src/formulas/FormulaRenderError.js'
import { QUICK_INSERT_ITEMS, LATEX_PALETTE_GROUPS } from '../src/config/latexPalette.js'

const CORPUS = [
  'x',
  'x^2',
  'x_i',
  '\\frac{a}{b}',
  '\\sqrt{x}',
  '\\sqrt[n]{x}',
  '\\alpha+\\beta=\\gamma',
  '\\sin(x)',
  '\\log(x)',
  '\\int_0^1 x^2\\,dx',
  '\\sum_{n=1}^{10} n',
  '\\lim_{x\\to 0}\\frac{\\sin x}{x}',
  '\\left(\\frac{a+b}{c}\\right)',
  '|x|',
  '\\vec{v}',
  '\\infty',
  '\\leq',
  '\\neq',
  '\\begin{matrix}1&2\\\\3&4\\end{matrix}',
  '\\begin{cases}x & x>0\\\\-x & x<0\\end{cases}',
  '\\text{Area}=\\pi r^2',
  '\\mathbb{R}',
  '\\mathcal{L}',
  '\\mathfrak{g}',
  '\\mathsf{ABC}',
  '\\mathtt{xyz}',
  String.raw`\boldsymbol{x}`,
  String.raw`\boldsymbol{\alpha}`,
  String.raw`\boldsymbol{\nabla}`,
  String.raw`\boldsymbol{x+\alpha}`,
  String.raw`A + \cancel{B}`,
  String.raw`\bcancel{x}`,
  String.raw`\xcancel{\frac{a}{b}}`,
  String.raw`a \coloneqq b`,
  String.raw`\xhookrightarrow{f}`,
  String.raw`\xlongequal{definition}`,
  String.raw`\xmapsto{f}`,
  String.raw`\bra{\phi}`,
  String.raw`\ket{\psi}`,
  String.raw`\braket{\phi|\psi}`,
]

function paletteLatex() {
  const items = [
    ...QUICK_INSERT_ITEMS,
    ...LATEX_PALETTE_GROUPS.flatMap((group) => group.items),
  ]
  return items.map((item) => item.preview).filter(Boolean)
}

function runtimeWithLiteEngine() {
  const engine = createMathJaxEngine(liteAdaptor())
  return new MathJaxRuntime({
    loadEngine: async () => engine,
  })
}

function markupWithoutStyle(svg) {
  return svg.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
}

test('MathJaxRuntime renders mandatory corpus to standalone SVG', async () => {
  const runtime = runtimeWithLiteEngine()
  for (const latex of CORPUS) {
    const svg = await runtime.renderSvg(latex)
    assert.match(svg, /<svg[\s>]/)
    assert.doesNotMatch(markupWithoutStyle(svg), /data-mml-node="merror"/)
    assert.match(svg, /width="[\d.]+"/)
    assert.doesNotMatch(svg, /width="[\d.]+ex"/)
  }
})


test('MathJaxRuntime renders boldsymbol as bold glyphs instead of an undefined command', async () => {
  const runtime = runtimeWithLiteEngine()
  const pairs = [
    ['x', String.raw`\boldsymbol{x}`],
    [String.raw`\alpha`, String.raw`\boldsymbol{\alpha}`],
    [String.raw`\nabla`, String.raw`\boldsymbol{\nabla}`],
  ]

  for (const [normalLatex, boldLatex] of pairs) {
    const normalSvg = await runtime.renderSvg(normalLatex)
    const boldSvg = await runtime.renderSvg(boldLatex)
    const normalWidth = Number(normalSvg.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1])
    const boldWidth = Number(boldSvg.match(/<svg[^>]*\bwidth="([\d.]+)"/)?.[1])

    assert.ok(normalWidth > 0 && boldWidth > 0)
    assert.ok(boldWidth < normalWidth * 2, `Unexpected extra content in ${boldLatex}`)
    assert.notEqual(boldSvg, normalSvg, `Expected a distinct bold glyph for ${boldLatex}`)
    assert.doesNotMatch(markupWithoutStyle(boldSvg), /data-mml-node="merror"/)
  }
})


const SHARED_EXTENSION_CASES = [
  { packageName: 'cancel', latex: String.raw`A + \cancel{B}` },
  { packageName: 'cancel', latex: String.raw`\bcancel{x}` },
  { packageName: 'cancel', latex: String.raw`\xcancel{\frac{a}{b}}` },
  { packageName: 'mathtools', latex: String.raw`a \coloneqq b` },
  { packageName: 'mathtools', latex: String.raw`\xhookrightarrow{f}` },
  { packageName: 'extpfeil', latex: String.raw`\xlongequal{definition}` },
  { packageName: 'extpfeil', latex: String.raw`\xmapsto{f}` },
  { packageName: 'braket', latex: String.raw`\bra{\phi}` },
  { packageName: 'braket', latex: String.raw`\ket{\psi}` },
  { packageName: 'braket', latex: String.raw`\braket{\phi|\psi}` },
]

test('MathJax SVG supports selected KaTeX-compatible extension commands without undefined-command text', async () => {
  const runtime = runtimeWithLiteEngine()
  for (const { packageName, latex } of SHARED_EXTENSION_CASES) {
    assert.doesNotThrow(() => katex.renderToString(latex, { throwOnError: true }),
      `KaTeX preview rejected ${packageName}: ${latex}`)
    const svg = await runtime.renderSvg(latex)
    const markup = markupWithoutStyle(svg)
    assert.match(svg, /<svg[\s>]/)
    assert.doesNotMatch(markup, /data-mml-node="(?:merror|mtext)"/,
      `Unexpected MathJax fallback for ${packageName}: ${latex}`)
    assert.match(svg, /width="[\d.]+"/)
  }
})

test('MathJax cancel variants create semantic strike-through enclosures', async () => {
  const runtime = runtimeWithLiteEngine()
  for (const latex of [
    String.raw`A + \cancel{B}`,
    String.raw`\bcancel{x}`,
    String.raw`\xcancel{\frac{a}{b}}`,
  ]) {
    const svg = await runtime.renderSvg(latex)
    assert.match(markupWithoutStyle(svg), /data-mml-node="menclose"/,
      `Expected cancellation enclosure for ${latex}`)
  }
})

test('MathJax-only extension macros are not misrepresented as supported KaTeX preview', () => {
  for (const latex of [
    String.raw`\cancelto{0}{x}`,
    String.raw`\prescript{a}{b}{X}`,
  ]) {
    assert.throws(() => katex.renderToString(latex, { throwOnError: true }),
      `KaTeX unexpectedly accepts ${latex}; review compatibility documentation`)
  }
})

test('MathJaxRuntime renders latexPalette previews', async () => {
  const runtime = runtimeWithLiteEngine()
  for (const latex of paletteLatex()) {
    const svg = await runtime.renderSvg(latex)
    assert.match(svg, /<svg[\s>]/)
    assert.doesNotMatch(markupWithoutStyle(svg), /data-mml-node="merror"/)
  }
})

test('MathJaxRuntime rejects invalid TeX via merror', async () => {
  const runtime = runtimeWithLiteEngine()
  await assert.rejects(
    () => runtime.renderSvg('\\frac{'),
    (error) => error instanceof FormulaRenderError && error.stage === 'mathjax_typeset',
  )
})

test('MathJaxRuntime isolates newcommand macros across formulas', async () => {
  const runtime = runtimeWithLiteEngine()
  const asZ = await runtime.renderSvg('z')
  await runtime.renderSvg('\\newcommand{\\foo}{z}\\foo')
  const alone = await runtime.renderSvg('\\foo')
  // Fresh TeX per conversion: prior \\newcommand must not make \\foo equal "z".
  assert.notEqual(alone, asZ)
})
