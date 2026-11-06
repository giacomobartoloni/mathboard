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
import { createPlotTransform, clipMathSegment } from '../src/plots/PlotGeometry.js'

const window={xMin:-2,xMax:6,yMin:-1,yMax:3}
test('math/frame round trips invert y in a nonsquare frame',()=>{
  const t=createPlotTransform(window,{width:800,height:200})
  assert.deepEqual(t.toFrame({x:0,y:0}),{x:200,y:150})
  assert.deepEqual(t.toFrame({x:6,y:3}),{x:800,y:0})
  assert.deepEqual(t.toMath({x:800,y:200}),{x:6,y:-1})
  assert.deepEqual(t.toMath(t.toFrame({x:2.5,y:-0.25})),{x:2.5,y:-0.25})
  assert.equal(t.isotropic,false)
  assert.equal(createPlotTransform(window,{width:800,height:400}).isotropic,true)
})
test('clipping intersects edges without clamping outside paths into false lines',()=>{
  assert.deepEqual(clipMathSegment({x:-4,y:0},{x:8,y:0},window),[{x:-2,y:0},{x:6,y:0}])
  assert.equal(clipMathSegment({x:-4,y:4},{x:8,y:4},window),null)
  assert.deepEqual(clipMathSegment({x:0,y:-3},{x:0,y:5},window),[{x:0,y:-1},{x:0,y:3}])
})
test('rejects invalid frames and preserves plot geometry independently of board zoom',()=>{
  for(const frame of [{width:0,height:2},{width:Infinity,height:2},{width:'2',height:2}]) assert.throws(()=>createPlotTransform(window,frame),{code:'invalid_domain'})
  const t=createPlotTransform(window,{width:800,height:200})
  // Viewport projection belongs to the caller; it never enters math/frame mapping.
  const local=t.toFrame({x:0,y:0})
  for(const zoom of [0.1,1,5]) {
    const screen={x:local.x*zoom+50,y:local.y*zoom-20}
    assert.deepEqual(t.toMath({x:(screen.x-50)/zoom,y:(screen.y+20)/zoom}),{x:0,y:0})
  }
})

test('rejects unrepresentable clipping deltas and underflowed scales',()=>{
  assert.throws(()=>clipMathSegment({x:0,y:-1e308},{x:0,y:1e308},window),{code:'invalid_domain'})
  assert.throws(()=>createPlotTransform(window,{width:Number.MIN_VALUE,height:1}),{code:'invalid_domain'})
})
