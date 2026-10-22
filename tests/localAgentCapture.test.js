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
import { validateCaptureRequest, planCapture, CAPTURE_LIMITS } from '../dev-agent/capture/contract.js'

const context = { width: 800, height: 600, viewportTransform: [2, 0, 0, 2, -200, 80], objects: [
  { id: 'a', bounds: { x: -20, y: 10, width: 50, height: 40 }, visible: true },
  { id: 'b', bounds: { x: 100, y: -10, width: 60, height: 90 }, visible: true, nestedIds: ['child'] },
] }
const invalid = value => assert.throws(() => validateCaptureRequest(value), e => e.code === 'invalid_capture_request')

test('strict capture union rejects unsupported options and invalid finite geometry before rendering', () => {
  for (const value of [null, [], {}, {target:{kind:'canvas'}}, {target:{kind:'viewport',rect:{}}},
    {target:{kind:'viewport'},padding:1}, {target:{kind:'viewport'},format:'jpeg'},
    {target:{kind:'viewport'},scale:0}, {target:{kind:'viewport'},scale:3.01},
    {target:{kind:'sceneRect',rect:{x:0,y:0,width:0,height:10}}},
    {target:{kind:'sceneRect',rect:{x:0,y:0,width:10,height:Infinity}}},
    {target:{kind:'sceneRect',rect:{x:0,y:0,width:10,height:10,extra:1}}},
    {target:{kind:'objectIds',ids:[]}}, {target:{kind:'objectIds',ids:['a','a']}},
    {target:{kind:'objectIds',ids:[' ']}}, {target:{kind:'objectIds',ids:['a'],padding:-1}},
    {target:{kind:'objectIds',ids:['a'],padding:129}}]) invalid(value)
  assert.deepEqual(validateCaptureRequest({target:{kind:'objectIds',ids:['a']}}), {target:{kind:'objectIds',ids:['a'],padding:16},scale:1,format:'png'})
})

test('scene crop ignores pan/zoom and rounds dimensions upward with effective source metadata', () => {
  const req=validateCaptureRequest({target:{kind:'sceneRect',rect:{x:-100,y:25,width:100.2,height:50.1}},scale:2})
  const plan=planCapture(req,context)
  assert.equal(plan.widthPx,201);assert.equal(plan.heightPx,101)
  assert.deepEqual(plan.renderTransform,[2,0,0,2,200,-50])
  assert.deepEqual(plan.region,{kind:'sceneRect',coordinateSpace:'scene',x:-100,y:25,width:100.5,height:50.5,
    requestedRect:{x:-100,y:25,width:100.2,height:50.1}})
})

test('ID capture uses union bounds and padding, reports IDs, rejects unknown/nested/empty union', () => {
  const plan=planCapture(validateCaptureRequest({target:{kind:'objectIds',ids:['b','a'],padding:10}}),context)
  assert.deepEqual(plan.region.unionBounds,{x:-20,y:-10,width:180,height:90})
  assert.deepEqual(plan.region.ids,['b','a']);assert.equal(plan.region.x,-30);assert.equal(plan.region.width,200)
  for(const id of ['missing','child']) assert.throws(()=>planCapture(validateCaptureRequest({target:{kind:'objectIds',ids:[id]}}),context),e=>e.code==='object_not_found')
  assert.throws(()=>planCapture(validateCaptureRequest({target:{kind:'objectIds',ids:['a']}}),{...context,objects:[{...context.objects[0],visible:false}]}),e=>e.code==='invalid_capture_request')
})

test('viewport metadata retains coordinate space and full transform without changing caller data', () => {
  const before=structuredClone(context)
  const plan=planCapture(validateCaptureRequest({target:{kind:'viewport'},scale:.5}),context)
  assert.equal(plan.widthPx,400);assert.equal(plan.heightPx,300)
  assert.deepEqual(plan.renderTransform,[1,0,0,1,-100,40])
  assert.equal(plan.region.coordinateSpace,'viewport');assert.deepEqual(plan.region.viewportTransform,context.viewportTransform)
  plan.region.viewportTransform[0]=77
  assert.deepEqual(context,before)
})

test('pixel and dimension ceilings reject huge captures before canvas allocation', () => {
  for(const [width,height,scale] of [[2049,10,1],[1500,1500,1],[1025,10,2],[1e200,10,3]]) {
    assert.throws(()=>planCapture(validateCaptureRequest({target:{kind:'sceneRect',rect:{x:0,y:0,width,height}},scale}),context),e=>e.code==='capture_too_large')
  }
  assert.equal(CAPTURE_LIMITS.maxPngBytes,5*1024*1024)
})


test('world bounds and clone data are read without calling live setters or changing transforms', async () => {
  const { readCaptureScene } = await import('../dev-agent/capture/scene.js')
  const { Rect, ActiveSelection } = await import('fabric')
  const { makeControllerCanvas } = await import('./helpers/controller-canvas.js')
  const a=new Rect({left:200,top:100,width:80,height:60,angle:27,strokeWidth:4})
  a.mathboardId='a'
  const b=new Rect({left:400,top:200,width:30,height:40});b.mathboardId='b'
  const selection=new ActiveSelection([a,b],{angle:12,scaleX:1.3,scaleY:.8})
  // ActiveSelection changes relative transforms; refresh Fabric's cached corners before the baseline.
  selection.setCoords();a.setCoords();b.setCoords()
  const canvas=makeControllerCanvas([a,b])
  const before=[a.toObject(),b.toObject(),selection.toObject()]
  const expected=a.getBoundingRect()
  const original=a.set;a.set=()=>{throw new Error('Live set called')}
  try {
    const state=readCaptureScene(canvas)
    for(const [key,value] of Object.entries({x:expected.left,y:expected.top,width:expected.width,height:expected.height})) {
      assert.ok(Math.abs(state.objects[0].bounds[key]-value)<1e-8, key)
    }
    assert.ok(state.objects[0].worldTransform)
    assert.deepEqual([a.toObject(),b.toObject(),selection.toObject()],before)
  } finally {a.set=original}
})


test('readiness refuses active interactions and pending work without cleaning up editing state', async () => {
  const { isCaptureStable, waitForCapturePaint }=await import('../dev-agent/capture/visual-capture.js')
  const canvas={getActiveObject:()=>null}
  const stale={isEditing:false}
  const flags={pan:false,shape:false,pencil:false,transform:false,textEdit:false}
  const board={canvas,sessionReady:true,_uncommittedText:stale,
    readInteractionState:()=>({...flags,textInsertionEditing:stale.isEditing})}
  assert.equal(isCaptureStable(board),true)
  assert.equal(board._uncommittedText,stale)
  for(const key of Object.keys(flags)) {
    flags[key]=true;assert.equal(isCaptureStable(board),false,key);flags[key]=false
  }
  assert.equal(isCaptureStable(board,1),false)
  stale.isEditing=true;assert.equal(isCaptureStable(board),false)
  assert.equal(board._uncommittedText,stale)
  const signal=new AbortController()
  const waiting=waitForCapturePaint({document:{fonts:{ready:new Promise(()=>{})}}},signal.signal)
  signal.abort()
  await assert.rejects(waiting,e=>e.code==='capture_failed')
})


test('F033 descriptor is detached and reports exact executable limits, media and stability', async () => {
  const {getScreenshotDescriptor}=await import('../dev-agent/capture/discovery.js')
  const descriptor=getScreenshotDescriptor()
  assert.equal(descriptor.mutatesBoard,false)
  assert.equal(descriptor.requiresStable,true)
  assert.deepEqual(descriptor.limits,CAPTURE_LIMITS)
  assert.equal(descriptor.resultSchema.properties.data.contentMediaType,'image/png')
  assert.deepEqual(descriptor.paramsSchema.properties.target.oneOf.map(s=>s.properties.kind.const),['sceneRect','objectIds','viewport'])
  validateCaptureRequest(descriptor.example.params)
  descriptor.limits.maxPixels=1
  assert.equal(getScreenshotDescriptor().limits.maxPixels,CAPTURE_LIMITS.maxPixels)
})


test('failed Fabric clones reject capture rather than silently dropping rendered content', async () => {
  const {createVisualCaptureAdapter}=await import('../dev-agent/capture/visual-capture.js')
  const {Rect,Group,classRegistry}=await import('fabric')
  const {makeControllerCanvas}=await import('./helpers/controller-canvas.js')
  class FailedCaptureClone extends Rect {
    static type='FailedCaptureClone'
    static fromObject(){return Promise.reject(new Error('synthetic clone failure'))}
  }
  classRegistry.setClass(FailedCaptureClone)
  const object=new FailedCaptureClone({width:40,height:30})
  const board={sessionReady:true,canvas:makeControllerCanvas([object]),getBoardId:()=> 'synthetic-board',readInteractionState:()=>({})}
  const environment={document:{fonts:{ready:Promise.resolve()}},
    requestAnimationFrame:callback=>{queueMicrotask(callback);return 1},cancelAnimationFrame:()=>{}}
  const capture=createVisualCaptureAdapter(()=>board,environment)
  await assert.rejects(capture.screenshot({target:{kind:'viewport'}}),e=>e.code==='capture_failed')
  board.canvas=makeControllerCanvas([new Group([object])])
  await assert.rejects(capture.screenshot({target:{kind:'viewport'}}),e=>e.code==='capture_failed')
  capture.dispose()
})

test('nested rendered resources have explicit traversal and depth limits before cloning', async () => {
  const {readCaptureScene}=await import('../dev-agent/capture/scene.js')
  const {Rect,Group}=await import('fabric')
  const {makeControllerCanvas}=await import('./helpers/controller-canvas.js')
  const root=new Group([])
  let cursor=root
  for(let i=0;i<CAPTURE_LIMITS.maxSceneDepth+1;i++) {
    const child=new Group([]);cursor._objects=[child];cursor=child
  }
  assert.throws(()=>readCaptureScene(makeControllerCanvas([root])),e=>e.code==='capture_too_large')
  const wide=new Group([])
  wide._objects=Array.from({length:CAPTURE_LIMITS.maxSceneNodes+1},()=>new Rect({width:1,height:1}))
  assert.throws(()=>readCaptureScene(makeControllerCanvas([wide])),e=>e.code==='capture_too_large')
})
