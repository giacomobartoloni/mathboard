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
import { composeBrandedCapture } from '../src/board/capture/branding.js'
import { validateCaptureRequest, planCapture } from '../src/board/capture/contract.js'

test('branding compositor draws the fixed MathBoard grid and copies board pixels unscaled', () => {
  const context={width:800,height:600,viewportTransform:[1,0,0,1,0,0],objects:[]}
  const plan=planCapture(validateCaptureRequest({target:{kind:'viewport'},includeLogo:true}),context)
  const calls=[]
  const ctx={
    fillRect(...args){calls.push(['fillRect',...args])},
    beginPath(){calls.push(['beginPath'])},
    moveTo(...args){calls.push(['moveTo',...args])},
    lineTo(...args){calls.push(['lineTo',...args])},
    stroke(){calls.push(['stroke'])},
    save(){calls.push(['save'])},
    restore(){calls.push(['restore'])},
    translate(...args){calls.push(['translate',...args])},
    scale(...args){calls.push(['scale',...args])},
    roundRect(...args){calls.push(['roundRect',...args])},
    fill(){calls.push(['fill'])},
    measureText(){return {width:115}},
    fillText(...args){calls.push(['fillText',...args])},
    drawImage(...args){calls.push(['drawImage',...args])},
  }
  const document={createElement(name){assert.equal(name,'canvas');return {getContext(type){assert.equal(type,'2d');return ctx}}}}
  const source={width:800,height:600}
  const output=composeBrandedCapture(document,source,plan.branding)
  assert.equal(output.width,800)
  assert.equal(output.height,688)
  assert.ok(calls.some(x=>x[0]==='moveTo'&&x[1]===40.5&&x[2]===0))
  assert.ok(calls.some(x=>x[0]==='moveTo'&&x[1]===0&&x[2]===40.5))
  assert.ok(calls.some(x=>x[0]==='fillText'&&x[1]==='MathBoard'))
  assert.deepEqual(calls.at(-1),['drawImage',source,0,88])
})

test('branding compositor rejects a missing detached 2D surface', () => {
  const branding={
    headerHeightPx:88,logoRectPx:{x:16,y:16,width:160,height:56},
    contentRectPx:{x:0,y:88,width:800,height:600},
  }
  assert.throws(()=>composeBrandedCapture({
    createElement(){return {getContext(){return null}}},
  },{},branding),e=>e.code==='capture_failed')
})
