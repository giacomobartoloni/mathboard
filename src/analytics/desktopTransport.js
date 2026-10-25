/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
export function createDesktopEventSender(send) {
  return (event, metadata) => { void Promise.resolve().then(() => send(event, metadata)).catch(() => {}) }
}
