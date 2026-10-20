import test from 'node:test'
import assert from 'node:assert/strict'
import { connectDesktopWindow, toggleDesktopFullscreen } from '../src/platform/nativeDesktop.js'

function fakeDesktop() {
  let fullscreen = false
  const listeners = {}
  const removed = []
  const nativeWindow = {
    isFullscreen: async () => fullscreen,
    setFullscreen: async (value) => { fullscreen = value },
    onResized: async (callback) => {
      listeners.resize = callback
      return () => removed.push('resize')
    },
    onFocusChanged: async (callback) => {
      listeners.focus = callback
      return () => removed.push('focus')
    },
  }
  const subscribe = async (name, callback) => {
    assert.equal(name, 'mathboard-native-menu')
    listeners.menu = callback
    return () => removed.push('menu')
  }
  return {
    nativeWindow, subscribe, listeners, removed,
    setFullscreen: (value) => { fullscreen = value },
  }
}

test('native menu actions call board undo and redo exactly once', async () => {
  const fake = fakeDesktop()
  const commands = []
  const states = []
  const disconnect = await connectDesktopWindow(
    {
      onUndo: () => commands.push('undo'),
      onRedo: () => commands.push('redo'),
      onFullscreenChange: (state) => states.push(state),
    },
    fake,
  )
  assert.deepEqual(states, [false])
  fake.listeners.menu({ payload: 'undo' })
  fake.listeners.menu({ payload: 'redo' })
  fake.listeners.menu({ payload: 'unknown' })
  assert.deepEqual(commands, ['undo', 'redo'])

  disconnect()
  fake.listeners.menu({ payload: 'undo' })
  assert.deepEqual(commands, ['undo', 'redo'])
  assert.deepEqual(fake.removed, ['resize', 'focus', 'menu'])
})

test('native resize and focus changes synchronize fullscreen state', async () => {
  const fake = fakeDesktop()
  const states = []
  const disconnect = await connectDesktopWindow(
    {
      onUndo: () => {},
      onRedo: () => {},
      onFullscreenChange: (state) => states.push(state),
    },
    fake,
  )
  fake.setFullscreen(true)
  fake.listeners.resize()
  await new Promise(setImmediate)
  fake.setFullscreen(false)
  fake.listeners.focus()
  await new Promise(setImmediate)
  assert.deepEqual(states, [false, true, false])
  disconnect()
})

test('desktop fullscreen button toggles the native window state', async () => {
  const fake = fakeDesktop()
  assert.equal(await toggleDesktopFullscreen(fake.nativeWindow), true)
  assert.equal(await toggleDesktopFullscreen(fake.nativeWindow), false)
})
