import test from 'node:test'
import assert from 'node:assert/strict'
import { isReactive, markRaw, reactive, toRaw } from 'vue'

/**
 * Regression for Cmd/Ctrl+A moving drawn shapes.
 * Fabric ActiveSelection layout uses `object.group === target`. Vue proxies
 * from putting fabric objects in `data()` break that identity check and
 * corrupt scene transforms. Keep canvas objects raw.
 */
test('plain objects assigned into reactive data become proxies', () => {
  const bag = reactive({ currentShape: null })
  const shape = { left: 10, top: 20 }
  bag.currentShape = shape
  assert.equal(isReactive(bag.currentShape), true)
  assert.notEqual(bag.currentShape, shape)
  assert.equal(toRaw(bag.currentShape), shape)
})

test('markRaw objects stay raw when stored in reactive data', () => {
  const bag = reactive({ currentShape: null })
  const shape = markRaw({ left: 10, top: 20 })
  bag.currentShape = shape
  assert.equal(isReactive(bag.currentShape), false)
  assert.equal(bag.currentShape, shape)
})

test('canvas-held proxies are not identity-equal to their raw targets', () => {
  const raw = markRaw({ left: 10 })
  const bag = reactive({ shape: null })
  // Without markRaw this would proxy; with a separately proxied wrapper:
  const proxied = reactive({ left: 10 })
  const asMembers = [toRaw(proxied)]
  assert.equal(asMembers.includes(proxied), false)
  assert.equal(asMembers.includes(toRaw(proxied)), true)
  bag.shape = raw
  assert.equal(bag.shape, raw)
  assert.equal(isReactive(bag.shape), false)
})
