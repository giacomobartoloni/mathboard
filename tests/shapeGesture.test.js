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
import { ShapeGesture } from '../src/board/interactions/ShapeGesture.js';

installFabricDomStub();

function canvasStub() {
  const objects = [];
  const listeners = new Map();
  return {
    objects,
    listeners,
    add(object) { objects.push(object); },
    remove(object) { const i = objects.indexOf(object); if (i >= 0) objects.splice(i, 1); },
    on(event, callback) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
    off(event, callback) { listeners.get(event)?.delete(callback); },
    fire(event, point) { for (const callback of [...(listeners.get(event) || [])]) callback({ scenePoint: point }); },
    renderAll() {}, requestRenderAll() {},
    getScenePoint(event) { return event; },
  };
}

function setup(shape = 'rectangle') {
  const canvas = canvasStub(), commands = [], completed = [];
  let selectedShape = shape;
  const gesture = new ShapeGesture({
    canvas,
    getShape: () => selectedShape,
    getInk: () => '#123456',
    getInkMode: () => 'fixed',
    onCommitted: (object, kind) => commands.push({ object, kind }),
    onComplete: () => completed.push(true),
  });
  gesture.activate();
  return { canvas, commands, completed, gesture, choose: (kind) => { selectedShape = kind; } };
}

test('rectangle draws in negative direction and commits once', () => {
  const {canvas,commands,completed,gesture} = setup();
  canvas.fire('mouse:down',{x:100,y:100});
  canvas.fire('mouse:move',{x:40,y:50});
  canvas.fire('mouse:up',{x:40,y:50});
  canvas.fire('mouse:up',{x:40,y:50});
  assert.equal(commands.length,1);
  assert.equal(completed.length,1);
  assert.equal(commands[0].object.left,40);
  assert.equal(commands[0].object.top,50);
  assert.equal(commands[0].object.width,60);
  assert.equal(commands[0].object.height,50);
  assert.equal(gesture.isActive(),false);
});

test('circle radius, arrow endpoint, and zero-size click retain geometry', () => {
  for (const [type, field, expected] of [['circle','radius',5],['arrow','x2',30],['rectangle','width',0]]) {
    const {canvas,commands}=setup(type);
    canvas.fire('mouse:down',{x:20,y:30});
    if (type!=='rectangle') canvas.fire('mouse:move',{x:30,y:30});
    canvas.fire('mouse:up',{x:30,y:30});
    assert.equal(commands.length,1,type);
    assert.equal(commands[0].object[field],expected,type);
  }
});

test('Escape cancel drops temporary shape without a command', () => {
  const {canvas,gesture,commands,completed}=setup();
  canvas.fire('mouse:down',{x:0,y:0});
  assert.equal(gesture.isActive(),true);
  assert.equal(gesture.cancel(),true);
  assert.equal(gesture.cancel(),false);
  assert.equal(canvas.objects.length,0);
  assert.equal(commands.length,0);
  assert.equal(completed.length,0);
});

test('tool switch finalizes once without one-shot callback and removes listeners', () => {
  const {canvas,gesture,commands,completed}=setup();
  canvas.fire('mouse:down',{x:0,y:0});
  canvas.fire('mouse:move',{x:50,y:30});
  gesture.deactivate();
  assert.equal(commands.length,1);
  assert.equal(completed.length,0);
  for(const listeners of canvas.listeners.values()) assert.equal(listeners.size,0);
  canvas.fire('mouse:up',{x:50,y:30});
  gesture.activate();
  gesture.activate();
  assert.equal(canvas.listeners.get('mouse:down').size,1);
  gesture.dispose();
  assert.equal(canvas.listeners.get('mouse:down').size,0);
});
