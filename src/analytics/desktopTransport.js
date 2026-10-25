/* MathBoard desktop analytics transport. */
export function createDesktopEventSender(send) {
  return (event, metadata) => { void Promise.resolve().then(() => send(event, metadata)).catch(() => {}) }
}
