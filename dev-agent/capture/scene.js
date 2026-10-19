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

import { FabricObject, util } from 'fabric'
import { getMathBoardObjectId } from '../../src/board/ids.js'
import { CAPTURE_LIMITS, captureError } from './contract.js'

function serializeRenderedObject(object,budget,depth=0) {
  if(++budget.nodes>CAPTURE_LIMITS.maxSceneNodes || depth>CAPTURE_LIMITS.maxSceneDepth) {
    throw captureError('capture_too_large','Rendered scene exceeds node or nesting limits.')
  }
  // Group.toObject filters excludeFromExport children and changes their export defaults.
  // Capture the actual visible tree, including export-excluded children, without those writes.
  const children=object.getObjects?.()
  const fields=['mathboardId','latex','formulaType','mathboardInkMode']
  const data=children ? {...FabricObject.prototype.toObject.call(object,fields),
    objects:children.map(child=>serializeRenderedObject(child,budget,depth+1))} : object.toObject(fields)
  for(const key of ['left','top','width','height','scaleX','scaleY','skewX','skewY','angle','strokeWidth']) {
    if(typeof object[key]==='number') data[key]=object[key]
  }
  return data
}

function forbidExternalResources(value) {
  if(!value||typeof value!=='object') return
  for(const [key,item] of Object.entries(value)) {
    if((key==='src'||key==='source')&&typeof item==='string'&&!/^data:image\/(png|jpeg|webp);base64,/.test(item)) {
      throw captureError('capture_failed','External image resources are not supported by local capture.')
    }
    forbidExternalResources(item)
  }
}

export function readCaptureScene(canvas) {
  const roots=canvas.getObjects()
  if(roots.length>CAPTURE_LIMITS.maxSceneObjects) throw captureError('capture_too_large','Too many scene objects for capture.')
  if(canvas.backgroundImage||canvas.overlayImage||canvas.clipPath) throw captureError('capture_failed','Unsupported canvas image or clipping resource.')
  let bytes=0
  const budget={nodes:0}
  const objects=roots.map(object=>{
    const corners=Object.values(object.calcACoords()).map(point=>object.group
      ? util.transformPoint(point,object.group.calcTransformMatrix()) : point)
    const x=Math.min(...corners.map(p=>p.x)),y=Math.min(...corners.map(p=>p.y))
    const bounds={x,y,width:Math.max(...corners.map(p=>p.x))-x,height:Math.max(...corners.map(p=>p.y))-y}
    const data=serializeRenderedObject(object,budget)
    forbidExternalResources(data)
    const serialized=JSON.stringify(data)
    bytes+=new TextEncoder().encode(serialized).length
    if(bytes>CAPTURE_LIMITS.maxSceneJsonBytes) throw captureError('capture_too_large','Scene serialization exceeds capture limits.')
    return {id:getMathBoardObjectId(object),bounds,visible:object.visible!==false,data,
      worldTransform:object.group ? object.calcTransformMatrix().slice() : null}
  })
  return {objects,width:canvas.getWidth(),height:canvas.getHeight(),viewportTransform:canvas.viewportTransform.slice(),
    fingerprint:JSON.stringify(objects),background:canvas.backgroundColor,backgroundVpt:canvas.backgroundVpt,
    overlay:canvas.overlayColor,overlayVpt:canvas.overlayVpt}
}
