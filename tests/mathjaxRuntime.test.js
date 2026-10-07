import test from 'node:test'
import assert from 'node:assert/strict'
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
