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

import test from 'node:test';
import assert from 'node:assert/strict';
import { PanGesture } from '../src/board/interactions/PanGesture.js';

function canvasStub() {
  const listeners=new Map(), viewportTransform=[1,0,0,1,3,4];
  return {
    listeners,viewportTransform,selection:true,rendered:0,
    on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    off(name,fn){listeners.get(name)?.delete(fn);},
    fire(name,e){for(const fn of [...(listeners.get(name)||[])])fn({e});},
    requestRenderAll(){this.rendered++;},
  };
}

test('mouse and touch pans update the live viewport without history', () => {
  const canvas=canvasStub();
  let starts=0,finishes=0,prevented=0;
  const g=new PanGesture({canvas,onStart:()=>starts++,onFinish:()=>finishes++});
  g.activate();
  canvas.fire('mouse:down',{clientX:10,clientY:20,preventDefault:()=>prevented++});
  canvas.fire('mouse:move',{clientX:30,clientY:15,preventDefault:()=>prevented++});
  canvas.fire('mouse:up',{});
  assert.deepEqual(canvas.viewportTransform,[1,0,0,1,23,-1]);
  canvas.fire('touch:start',{touches:[{clientX:7,clientY:4}],preventDefault:()=>prevented++});
  canvas.fire('touch:move',{touches:[{clientX:3,clientY:8}],preventDefault:()=>prevented++});
  canvas.fire('touch:end',{changedTouches:[{clientX:3,clientY:8}]});
  assert.deepEqual(canvas.viewportTransform,[1,0,0,1,19,3]);
  assert.equal(starts,2);
  assert.equal(finishes,2);
  assert.equal(prevented,4);
  assert.equal(g.isActive(),false);
});

test('deactivate finalizes drag and repeated tool switches do not leak listeners', () => {
  const canvas=canvasStub(),finishes=[];
  const g=new PanGesture({canvas,onFinish:()=>finishes.push(true)});
  for(let i=0;i<3;i++){g.activate();g.activate();g.deactivate();}
  for(const callbacks of canvas.listeners.values()) assert.equal(callbacks.size,0);
  g.activate();
  canvas.fire('mouse:down',{clientX:0,clientY:0,preventDefault(){}});
  assert.equal(g.isActive(),true);
  g.dispose();
  assert.equal(finishes.length,1);
  for(const callbacks of canvas.listeners.values()) assert.equal(callbacks.size,0);
});
