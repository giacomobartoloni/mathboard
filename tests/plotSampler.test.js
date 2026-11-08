/*
MathBoard

Copyright (C) 2026 Giacomo Bartoloni

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlotExpression } from '../src/plots/PlotExpression.js'
import { samplePlot } from '../src/plots/PlotSampler.js'

const window = { xMin: -0.5, xMax: 5.5, yMin: -2, yMax: 12 }
const points = r => r.segments.flat()
function noCross(result, pole) {
  assert.ok(result.segments.length >= 2)
  for (const s of result.segments) assert.ok(s.every(p => p.x < pole) || s.every(p => p.x > pole))
}

test('sampler includes exact polynomial reference points and opens upward', () => {
  const p = parsePlotExpression('x^2-5x+6')
  const r = samplePlot(p, window, { intervals: 12 })
  assert.equal(r.status, 'ok')
  for (const [x,y] of [[2,0],[3,0],[2.5,-0.25]]) assert.ok(points(r).some(p => p.x === x && p.y === y))
  assert.ok(points(r)[0].y > 0)
  assert.ok(points(r).at(-1).y > 0)
})

test('simple, off-grid, even poles and tangent split without cross-pole chords', () => {
  for (const [s, pole] of [['1/x',0], ['1/(x-0.12345)',0.12345], ['1/(x-0.12345)^2',0.12345], ['\\tan(x)',Math.PI/2]]) {
    const r=samplePlot(parsePlotExpression(s), {xMin:-2,xMax:2,yMin:-10,yMax:10})
    noCross(r,pole)
    assert.ok(points(r).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
  }
})

test('sqrt and log retain real domains and include valid domain boundaries', () => {
  const sqrt=samplePlot(parsePlotExpression('\\sqrt{x}'),{xMin:-2,xMax:4,yMin:-1,yMax:3},{intervals:12})
  assert.ok(points(sqrt).every(p=>p.x>=0))
  assert.ok(points(sqrt).some(p=>p.x===0 && p.y===0))
  assert.ok(points(sqrt).some(p=>p.x===4 && p.y===2))
  const log=samplePlot(parsePlotExpression('\\log(x)'),{xMin:-1,xMax:3,yMin:-5,yMax:3})
  assert.ok(points(log).length>0)
  assert.ok(points(log).every(p=>p.x>0))
})

test('trigonometric samples use radians and remain deterministic', () => {
  const p=parsePlotExpression('\\sin(x)')
  const w={xMin:-2*Math.PI,xMax:2*Math.PI,yMin:-2,yMax:2}
  const r=samplePlot(p,w,{intervals:16})
  for(const x of [-Math.PI,0,Math.PI]) assert.ok(points(r).some(p=>Math.abs(p.x-x)<1e-12 && Math.abs(p.y)<1e-12))
  assert.ok(points(r).every(p=>Math.abs(p.y)<=1))
  assert.deepEqual(r,samplePlot(p,w,{intervals:16}))
})

test('invalid windows, evaluator errors, empty real domain and exhaustion are distinct', () => {
  const p=parsePlotExpression('x')
  for(const w of [{...window,xMax:Infinity},{...window,xMax:-1},{...window,yMin:12},{...window,xMin:'0'}]) {
    assert.throws(()=>samplePlot(p,w),{code:'invalid_domain'})
  }
  assert.throws(()=>samplePlot(p,window,{maxEvaluations:1}),{code:'computation_limit'})
  assert.throws(()=>samplePlot({evaluate(){throw Error('bad')}},window),{code:'evaluator_failure'})
  assert.equal(samplePlot(parsePlotExpression('\\sqrt{-1}'),window).status,'no_real_samples')
  const r=samplePlot(parsePlotExpression('1/(x-0.12345)'),window,{maxEvaluations:40,intervals:16})
  assert.equal(r.status,'computation_limit')
  assert.ok(r.diagnostics.evaluations<=40)
  assert.ok(r.diagnostics.unresolvedIntervals>0)
  for(const s of r.segments) assert.ok(s.every(p=>p.x<0.12345)||s.every(p=>p.x>0.12345))
})

test('small-amplitude negative powers and narrow sqrt/log domain holes are not bridged', () => {
  for (const s of ['0.000001(x-0.12345)^{-1}', '0.000001\\ln((x-0.12345)^2)',
    '0.000001\\sqrt{(x-0.123)(x-0.124)}']) {
    const r=samplePlot(parsePlotExpression(s),{xMin:-2,xMax:2,yMin:-10,yMax:10})
    for (const segment of r.segments) assert.ok(segment.every(p=>p.x<0.12345)||segment.every(p=>p.x>0.12345),s)
  }
})

test('explicit output point budget bounds highly refined curves', () => {
  const r=samplePlot(parsePlotExpression('\\sin(100x)'),window,{maxPoints:30})
  assert.equal(r.status,'computation_limit')
  assert.ok(points(r).length<=30)
})

test('a missed narrow real island reports no samples rather than proving an empty domain', () => {
  const p=parsePlotExpression('\\sqrt{0.00000001-(x-0.12345)^2}')
  assert.ok(Number.isFinite(p.evaluate(0.12345)))
  assert.equal(samplePlot(p,{xMin:-2,xMax:2,yMin:-10,yMax:10}).status,'no_real_samples')
})
