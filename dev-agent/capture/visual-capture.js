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

import { StaticCanvas, Pattern, util } from 'fabric'
import '../../src/formulas/FormulaObject.js'
import { CAPTURE_LIMITS, captureError, validateCaptureRequest, planCapture } from './contract.js'
import { readCaptureScene } from './scene.js'

const notReady=()=>{throw captureError('board_not_ready','Wait for a stable, fully rendered board before capture.')}

/** A read-only guard: unlike the existing observer, never cleans up a stale editing reference. */
export function isCaptureStable(board,pending=0) {
  const c=board?.canvas
  const interaction=board?.readInteractionState?.()
  return Boolean(c && board.sessionReady && !pending && interaction
    && !interaction.pan && !interaction.shape && !interaction.pencil
    && !interaction.transform && !interaction.textEdit && !interaction.textInsertionEditing
    && !c.getActiveObject()?.isEditing
    && !c._currentTransform && !c._groupSelector && !c._isCurrentlyDrawing)
}

function assertNotAborted(signal) {
  if(signal.aborted) throw captureError('capture_failed','Capture readiness or rendering deadline exceeded.')
}

export async function waitForCapturePaint(environment,signal) {
  assertNotAborted(signal)
  await new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(captureError('capture_failed','Capture font deadline exceeded.'))}
    signal.addEventListener('abort',abort,{once:true})
    Promise.resolve(environment.document.fonts.ready).then(resolve,reject)
      .finally(()=>signal.removeEventListener('abort',abort))
  })
  assertNotAborted(signal)
  for(let frame=0;frame<2;frame++) {
    await new Promise((resolve,reject)=>{
      const abort=()=>{environment.cancelAnimationFrame(id);reject(captureError('capture_failed','Capture paint deadline exceeded.'))}
      const id=environment.requestAnimationFrame(()=>{signal.removeEventListener('abort',abort);resolve()})
      signal.addEventListener('abort',abort,{once:true})
    })
    assertNotAborted(signal)
  }
}

function copyPaint(paint) {
  if(!paint||typeof paint==='string') return paint
  // The app's theme/grid is a local canvas pattern. Reuse only its immutable pixel source.
  if(paint instanceof Pattern && typeof paint.source?.getContext==='function') {
    return new Pattern({source:paint.source,repeat:paint.repeat,offsetX:paint.offsetX,offsetY:paint.offsetY,
      patternTransform:paint.patternTransform?.slice()})
  }
  throw captureError('capture_failed','Unsupported canvas background resource.')
}

async function pngBlob(element,signal) {
  assertNotAborted(signal)
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(captureError('capture_failed','Capture encoding deadline exceeded.'))}
    signal.addEventListener('abort',abort,{once:true})
    element.toBlob(blob=>{
      signal.removeEventListener('abort',abort)
      if(signal.aborted) return
      if(blob) resolve(blob)
      else reject(captureError('capture_failed','Unable to encode local PNG.'))
    },'image/png')
  })
}

// Fabric 7 intentionally drops rejected enlivened nodes. A visual capture must never omit them silently.
function assertCloneTree(data,clone) {
  if(!clone) throw captureError('capture_failed','Unable to clone the complete rendered scene.')
  if(Array.isArray(data.objects)) {
    const children=clone.getObjects?.()
    if(!children||children.length!==data.objects.length) throw captureError('capture_failed','Incomplete rendered group clone.')
    data.objects.forEach((child,index)=>assertCloneTree(child,children[index]))
  }
}

async function blobBase64(blob) {
  if(blob.size>CAPTURE_LIMITS.maxPngBytes) throw captureError('capture_too_large','PNG exceeds the byte limit.')
  const bytes=new Uint8Array(await blob.arrayBuffer())
  let binary=''
  for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768))
  return btoa(binary)
}

/** Agent entrypoint owns this adapter; neither controller nor production bundle gets capture APIs. */
export function createVisualCaptureAdapter(getBoard,environment=globalThis) {
  let pendingRenders=0,pendingMutations=0,active=0,renderer,originalRender,wrappedRender
  function attach() {
    const current=getBoard()?._formulaRenderer
    if(!current||renderer===current) return
    detachRenderer()
    renderer=current;originalRender=current.render
    wrappedRender=function(...args) {
      pendingRenders++
      try{return Promise.resolve(originalRender.apply(this,args)).finally(()=>pendingRenders--)}
      catch(error){pendingRenders--;throw error}
    }
    renderer.render=wrappedRender
  }
  function detachRenderer() {
    if(renderer && renderer.render===wrappedRender) renderer.render=originalRender
    renderer=null
  }
  function assertReady(board,canvas) {
    if(getBoard()!==board||board?.canvas!==canvas||!isCaptureStable(board,pendingRenders+pendingMutations)) notReady()
  }
  async function render(request,signal) {
    attach()
    const board=getBoard(),canvas=board?.canvas
    assertReady(board,canvas)
    await waitForCapturePaint(environment,signal)
    assertReady(board,canvas)
    const scene=readCaptureScene(canvas),boardId=board.getBoardId()
    const plan=planCapture(request,scene)
    let offscreen,clones=[]
    try {
      clones=await util.enlivenObjects(scene.objects.map(o=>o.data),{signal})
      if(clones.length!==scene.objects.length) throw captureError('capture_failed','Incomplete scene clone.')
      scene.objects.forEach((row,index)=>assertCloneTree(row.data,clones[index]))
      assertNotAborted(signal)
      clones.forEach((clone,index)=>{
        const matrix=scene.objects[index].worldTransform
        if(matrix) util.applyTransformToObject(clone,matrix)
        clone.setCoords()
      })
      offscreen=new StaticCanvas(environment.document.createElement('canvas'),{width:plan.widthPx,height:plan.heightPx,
        enableRetinaScaling:false,renderOnAddRemove:false,skipOffscreen:false,
        backgroundColor:copyPaint(scene.background),backgroundVpt:scene.backgroundVpt,
        overlayColor:copyPaint(scene.overlay),overlayVpt:scene.overlayVpt})
      offscreen.setViewportTransform(plan.renderTransform)
      offscreen.add(...clones)
      offscreen.renderAll()
      const blob=await pngBlob(offscreen.lowerCanvasEl,signal)
      assertNotAborted(signal)
      if(blob.size>CAPTURE_LIMITS.maxPngBytes) throw captureError('capture_too_large','PNG exceeds the byte limit.')
      assertReady(board,canvas)
      const assertCurrent=()=>{
        assertReady(board,canvas)
        const current=readCaptureScene(canvas)
        if(current.fingerprint!==scene.fingerprint||current.background!==scene.background||current.overlay!==scene.overlay
          ||current.backgroundVpt!==scene.backgroundVpt||current.overlayVpt!==scene.overlayVpt
          ||current.width!==scene.width||current.height!==scene.height||board.getBoardId()!==boardId
          ||current.viewportTransform.some((v,i)=>v!==scene.viewportTransform[i])) notReady()
      }
      assertCurrent()
      const data=await blobBase64(blob)
      assertNotAborted(signal)
      assertCurrent()
      return {mimeType:'image/png',encoding:'base64',data,widthPx:plan.widthPx,heightPx:plan.heightPx,
        region:plan.region,scale:plan.scale,boardId,observationVersion:1}
    } finally {
      if(offscreen) await offscreen.dispose()
      else clones.forEach(clone=>clone.dispose())
    }
  }
  attach()
  return {
    attach,
    beginMutation(){attach();pendingMutations++;return ()=>{pendingMutations--}},
    async screenshot(params) {
      const request=validateCaptureRequest(params)
      if(active>=CAPTURE_LIMITS.maxConcurrentCaptures) throw captureError('capture_failed','Capture concurrency limit reached.')
      active++
      const aborter=new AbortController()
      let timer
      try {
        return await Promise.race([render(request,aborter.signal),new Promise((_,reject)=>{
          timer=setTimeout(()=>{aborter.abort();reject(captureError('capture_failed','Capture readiness or rendering deadline exceeded.'))},CAPTURE_LIMITS.readinessTimeoutMs)
        })])
      } catch(error) {
        if(['invalid_capture_request','board_not_ready','object_not_found','capture_too_large','capture_failed'].includes(error?.code)) throw error
        throw captureError('capture_failed','Unable to capture the local board.')
      } finally {clearTimeout(timer);aborter.abort();active--}
    },
    dispose(){detachRenderer()},
  }
}
