/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { BoardWorkspaceService } from '../src/board/BoardWorkspaceService.js'
import { createEmptyBoardDocument } from '../src/board/persistence/schema.js'

test('workspace import delegates to existing independent-copy persistence and returns its summary', async () => {
  const source = createEmptyBoardDocument('Lesson')
  const calls = []
  const persistence = {
    boardId: 'mb_previous',
    async importSharedBoard(document) {
      calls.push(document)
      this.boardId = 'mb_imported'
      return { id: 'mb_imported', title: document.title, createdAt: '2026-11-16T00:00:00.000Z' }
    },
  }
  const workspace = new BoardWorkspaceService(persistence)
  const result = await workspace.importBoard({ document: source })
  assert.deepEqual(calls, [source])
  assert.equal(result.id, 'mb_imported')
  assert.equal(result.title, 'Lesson')
  assert.equal(result.isActive, true)
})
