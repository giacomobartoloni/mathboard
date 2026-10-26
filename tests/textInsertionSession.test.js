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
import { installFabricDomStub } from './helpers/fabric-dom-stub.js';
import { TextInsertionSession } from '../src/board/interactions/TextInsertionSession.js';

installFabricDomStub();

function setup() {
  const objects=[],listeners=new Map(),results={started:0,added:[],cancelled:[],completed:0};
  const canvas={
    getScenePoint:(p)=>p,
    add:(obj)=>objects.push(obj),setActiveObject() {},
    requestRenderAll() {},
    on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    off:(name,fn)=>listeners.get(name)?.delete(fn),
    fire:(name,point)=>{for(const fn of [...(listeners.get(name)||[])])fn({scenePoint:point});},
  };
  const session=new TextInsertionSession({
    canvas,getInk:()=> '#222222',getInkMode:()=> 'fixed',
    scheduleFocus:()=>{},
    onStarted:()=>results.started++,
    onCommitted:(obj)=>results.added.push(obj),
    onCancelled:(obj)=>results.cancelled.push(obj),
    onComplete:()=>results.completed++,
  });
  session.activate();
  return {canvas,session,objects,results,listeners};
}

test('unchanged initial placeholder cancels once; later exit cannot duplicate callback', () => {
  const {canvas,session,objects,results}=setup();
  canvas.fire('mouse:down',{x:15,y:20});
  const initial=objects[0];
  assert.equal(session.hasPending(),true);
  initial.fire('editing:exited');
  initial.fire('editing:exited');
  assert.equal(session.hasPending(),false);
  assert.equal(results.started,1);
  assert.deepEqual(results.cancelled,[initial]);
  assert.equal(results.added.length,0);
  assert.equal(results.completed,1);
});

test('committed initial text emits one add and disables placement listener', () => {
  const {canvas,session,objects,results,listeners}=setup();
  canvas.fire('mouse:down',{x:10,y:20});
  const text=objects[0];
  text.text='Math';
  text.fire('editing:exited');
  assert.deepEqual(results.added,[text]);
  assert.equal(results.cancelled.length,0);
  assert.equal(results.completed,1);
  assert.equal(listeners.get('mouse:down').size,0);
  session.dispose();
});

test('tool change removes insertion subscription but leaves active editing session intact', () => {
  const {canvas,session,objects,results}=setup();
  canvas.fire('mouse:down',{x:0,y:0});
  session.deactivate();
  assert.equal(session.hasPending(),true);
  objects[0].text='x';
  objects[0].fire('editing:exited');
  assert.equal(results.added.length,1);
});

test('read-only pending probe leaves stale reference untouched until mutation cleanup', () => {
  const {canvas,session,objects}=setup();
  canvas.fire('mouse:down',{x:0,y:0});
  assert.equal(session.hasPending(),true);
  assert.equal(session.isPendingEditing(),false);
  assert.equal(session.hasPending(),true);
  assert.equal(session.owns(objects[0]),true);
  assert.equal(session.clearStale(),true);
  assert.equal(session.hasPending(),false);
});
