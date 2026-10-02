/**
 * Minimal DOM/canvas stubs so Fabric IText (and kit text nodes) can construct
 * under node:test without jsdom.
 */
export function installFabricDomStub() {
  if (globalThis.__mathboardFabricDomStub) return
  globalThis.__mathboardFabricDomStub = true

  if (!globalThis.window) {
    globalThis.window = globalThis
  }

  const createCanvasContext = (canvas) => ({
    canvas,
    fillRect() {},
    clearRect() {},
    getImageData() {
      return { data: new Uint8ClampedArray(4) }
    },
    putImageData() {},
    createImageData() {
      return { data: new Uint8ClampedArray(4) }
    },
    setTransform() {},
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    translate() {},
    scale() {},
    rotate() {},
    arc() {},
    fillText() {},
    measureText: (text) => ({ width: String(text).length * 7 }),
    font: '',
  })

  const createElement = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      style: {},
      setAttribute() {},
      appendChild() {},
      removeChild() {},
      getContext(type) {
        if (type !== '2d') return null
        return createCanvasContext(el)
      },
      width: 0,
      height: 0,
    }
    return el
  }

  if (!globalThis.document) {
    globalThis.document = {
      createElement,
      createElementNS: () => createElement('canvas'),
      documentElement: { style: {} },
      body: { appendChild() {}, removeChild() {} },
    }
  }

  if (!globalThis.HTMLCanvasElement) {
    globalThis.HTMLCanvasElement = function HTMLCanvasElement() {}
  }

  if (!globalThis.Image) {
    globalThis.Image = class Image {
      set src(_value) {
        queueMicrotask(() => {
          if (typeof this.onload === 'function') this.onload()
        })
      }
    }
  }
}
