/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { validateBoardDocument } from './schema.js'

export function downloadBoardDocument(document) {
  validateBoardDocument(document)
  const name = document.title.normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '-')
    .split('').map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? '-' : char).join('')
    .trim().replace(/[. ]+$/g, '').slice(0, 80) || 'board'
  const blob = new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = name + '.mathboard.json'
  window.document.body.appendChild(anchor)
  try { anchor.click() }
  finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
