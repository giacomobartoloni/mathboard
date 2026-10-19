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

export const CAPTURE_LIMITS = Object.freeze({
  minScale: 0.5, maxScale: 3, maxPadding: 128, maxDimension: 2048, maxPixels: 2097152,
  maxPngBytes: 5 * 1024 * 1024, maxBase64Chars: 4 * Math.ceil(5 * 1024 * 1024 / 3),
  maxResultBodyBytes: 7 * 1024 * 1024, maxCommandBodyBytes: 64 * 1024,
  maxPendingCommands: 16, maxConcurrentCaptures: 2, readinessTimeoutMs: 10000,
  maxSceneObjects: 2000, maxSceneNodes: 10000, maxSceneDepth: 64, maxSceneJsonBytes: 8 * 1024 * 1024,
})

export function captureError(code, message) {
  return Object.assign(new Error(message), { code })
}
const invalid = () => { throw captureError('invalid_capture_request', 'Invalid capture target or options.') }
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype
const keys = (value, allowed) => plain(value) && Object.keys(value).every(key => allowed.includes(key))
const finite = value => typeof value === 'number' && Number.isFinite(value)
const rectValid = rect => keys(rect, ['x','y','width','height']) && ['x','y','width','height'].every(k => finite(rect[k]))
  && rect.width > 0 && rect.height > 0 && finite(rect.x + rect.width) && finite(rect.y + rect.height)

export function validateCaptureRequest(params) {
  if (!keys(params,['target','scale','format'])) invalid()
  const scale=params.scale === undefined ? 1 : params.scale
  if (!finite(scale) || scale<CAPTURE_LIMITS.minScale || scale>CAPTURE_LIMITS.maxScale
    || ('format' in params && params.format !== 'png')) invalid()
  const target=params.target
  if (!plain(target)) invalid()
  if (target.kind==='sceneRect') {
    if (!keys(target,['kind','rect']) || !rectValid(target.rect)) invalid()
  } else if (target.kind==='objectIds') {
    if (!keys(target,['kind','ids','padding']) || !Array.isArray(target.ids) || !target.ids.length
      || target.ids.length>CAPTURE_LIMITS.maxSceneObjects || target.ids.some(id=>typeof id!=='string'||!id.trim())
      || new Set(target.ids).size!==target.ids.length) invalid()
    const padding=target.padding===undefined ? 16 : target.padding
    if (!finite(padding)||padding<0||padding>CAPTURE_LIMITS.maxPadding) invalid()
    return { target:{kind:target.kind,ids:target.ids.slice(),padding},scale,format:'png' }
  } else if (target.kind==='viewport') {
    if (!keys(target,['kind'])) invalid()
  } else invalid()
  return { target:structuredClone(target),scale,format:'png' }
}

export function planCapture(request, context) {
  const {target,scale}=request
  let rect,region,renderTransform
  if (target.kind==='sceneRect') {
    rect={...target.rect}; region={requestedRect:{...rect}}
  } else if (target.kind==='objectIds') {
    const rows=target.ids.map(id=>{
      const item=context.objects.find(o=>o.id===id)
      if(!item) throw captureError('object_not_found','A requested ID is missing or not a top-level object.')
      return item
    }).filter(o=>o.visible!==false)
    if(!rows.length || rows.some(o=>!rectValid(o.bounds))) invalid()
    const x=Math.min(...rows.map(o=>o.bounds.x)),y=Math.min(...rows.map(o=>o.bounds.y))
    const width=Math.max(...rows.map(o=>o.bounds.x+o.bounds.width))-x
    const height=Math.max(...rows.map(o=>o.bounds.y+o.bounds.height))-y
    const unionBounds={x,y,width,height}
    rect={x:x-target.padding,y:y-target.padding,width:width+2*target.padding,height:height+2*target.padding}
    region={ids:target.ids.slice(),unionBounds,padding:target.padding}
  } else {
    rect={x:0,y:0,width:context.width,height:context.height}
    const vpt=context.viewportTransform
    if(!Array.isArray(vpt)||vpt.length!==6||!vpt.every(finite)||vpt[0]*vpt[3]-vpt[1]*vpt[2]===0) {
      throw captureError('capture_failed','Invalid live viewport transform.')
    }
    renderTransform=vpt.map(value=>value*scale)
    region={viewportTransform:vpt.slice()}
  }
  if(!rectValid(rect)) invalid()
  const widthPx=Math.ceil(rect.width*scale),heightPx=Math.ceil(rect.height*scale)
  if(!Number.isSafeInteger(widthPx)||!Number.isSafeInteger(heightPx)||widthPx>CAPTURE_LIMITS.maxDimension
    ||heightPx>CAPTURE_LIMITS.maxDimension||widthPx*heightPx>CAPTURE_LIMITS.maxPixels) {
    throw captureError('capture_too_large','Capture exceeds output dimension or pixel limits.')
  }
  if(!renderTransform) renderTransform = [scale,0,0,scale,-rect.x*scale,-rect.y*scale]
  return {widthPx,heightPx,scale,renderTransform,region:{kind:target.kind,
    coordinateSpace:target.kind==='viewport'?'viewport':'scene',x:rect.x,y:rect.y,
    width:widthPx/scale,height:heightPx/scale,...region}}
}
