/**
 * Minimal Fabric-shaped stubs for stamp deflate tests (no canvas required).
 */
export function fabricLike(type, props = {}) {
  const normalized = String(type)
  return {
    type: normalized,
    isType(...types) {
      const actual = normalized.toLowerCase()
      return types.some((candidate) => String(candidate).toLowerCase() === actual)
    },
    ...props,
  }
}

export function stampDoc(objects) {
  return { version: 1, objects }
}
