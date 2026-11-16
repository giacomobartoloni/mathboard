/*
MathBoard
Copyright (C) 2026 Giacomo Bartoloni
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyBoardDocument, BOARD_DOCUMENT_MAX_BYTES } from '../src/board/persistence/schema.js'
import { BoardFileImportError, readBoardDocumentFile } from '../src/board/persistence/readBoardDocumentFile.js'

const doc = createEmptyBoardDocument('Lesson')
const asFile = (name, contents) => ({
  name,
  size: new TextEncoder().encode(contents).length,
  text: async () => contents,
})

test('imports current and legacy .mathboard JSON files after schema validation', async () => {
  for (const name of ['Lesson.mathboard', 'Old.mathboard.json', 'LESSON.MATHBOARD']) {
    const parsed = await readBoardDocumentFile([asFile(name, JSON.stringify(doc))])
    assert.deepEqual(parsed, doc)
  }
})

test('rejects non-board extensions, no file and multiple files', async () => {
  await assert.rejects(readBoardDocumentFile([]), { code: 'file_count' })
  await assert.rejects(readBoardDocumentFile([asFile('lesson.mathboard', '{}'), asFile('other.mathboard', '{}')]), {
    code: 'file_count',
  })
  await assert.rejects(readBoardDocumentFile([asFile('lesson.json', '{}')]), { code: 'extension' })
  await assert.rejects(readBoardDocumentFile([asFile('lesson.mathboard.txt', '{}')]), { code: 'extension' })
})

test('rejects oversized files before attempting to read them', async () => {
  let reads = 0
  const oversized = {
    name: 'lesson.mathboard',
    size: BOARD_DOCUMENT_MAX_BYTES + 1,
    async text() { reads++; return JSON.stringify(doc) },
  }
  await assert.rejects(readBoardDocumentFile([oversized]), { code: 'too_large' })
  assert.equal(reads, 0)
})

test('rejects corrupt JSON, invalid schema and unsupported versions with safe error text', async () => {
  const cases = [
    { value: '{private formula', code: 'invalid' },
    { value: JSON.stringify({ ...doc, format: 'not-mathboard' }), code: 'invalid' },
    { value: JSON.stringify({ ...doc, version: 999 }), code: 'version' },
    { value: JSON.stringify({ ...doc, objects: [{ id: 'bad', type: 'unknown' }] }), code: 'invalid' },
  ]
  for (const entry of cases) {
    await assert.rejects(readBoardDocumentFile([asFile('lesson.mathboard', entry.value)]), error => {
      assert.ok(error instanceof BoardFileImportError)
      assert.equal(error.code, entry.code)
      assert.ok(!error.message.includes('private formula'))
      assert.ok(!error.message.includes('objects['))
      assert.ok(!error.message.includes('999'))
      return true
    })
  }
})

test('handles unreadable files without leaking their exception', async () => {
  const file = {
    name: 'lesson.mathboard',
    size: 120,
    text: async () => { throw new Error('Private board file system path') },
  }
  await assert.rejects(readBoardDocumentFile([file]), error => {
    assert.equal(error.code, 'read')
    assert.ok(!error.message.includes('Private'))
    return true
  })
})

test('permits a UTF-8 BOM for compatibility with exported JSON documents', async () => {
  assert.deepEqual(await readBoardDocumentFile([asFile('lesson.mathboard', '\uFEFF' + JSON.stringify(doc))]), doc)
})
