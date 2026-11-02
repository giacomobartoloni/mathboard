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

import { IndexedDbBoardRepository, createBoardRecord } from '../../src/storage/local/IndexedDbBoardRepository.js'

export async function runInactiveBrowser(service) {
  const repository = new IndexedDbBoardRepository()
  const target = await repository.create(createBoardRecord({ title: 'Inactive target',
    document: { format: 'mathboard-board', version: 1, title: 'Inactive target', objects: [] } }))
  const execute = (method, params) => service.executeOnBoard({ boardId: target.id, method, params },
    { expiresAtMs: Date.now() + 10000 })
  const created = await execute('createMany', { specs: [
    { type: 'rect', width: 30, height: 20, left: 40, top: 50, fill: '#123456', mathboardInkMode: 'fixed' },
    { type: 'text', text: 'B', left: 100, top: 80, fill: '#123456', mathboardInkMode: 'fixed' },
    { type: 'formula', latex: 'x^2=4', left: 180, top: 120, scaleX: 1.2, angle: 17, skewX: 8,
      fill: '#123456', mathboardInkMode: 'fixed' },
  ] })
  const inactiveMeasure = await execute('measure', { id: created[2].id })
  await execute('update', { id: created[0].id, patch: { left: 70 } })
  await execute('update', { id: created[1].id, patch: { mathboardInkMode: 'auto' } })
  await execute('update', { id: created[2].id, patch: { latex: 'x^2=9' } })
  const updatedMeasure = await execute('measure', { id: created[2].id })
  const group = await execute('group', { ids: [created[0].id, created[1].id] })
  let invalidLatexCode = null
  try { await execute('create', { spec: { type: 'formula', latex: '\\frac{' } }) }
  catch (error) { invalidLatexCode = error?.code }
  const observed = await execute('observe', {})
  const persisted = await repository.get(target.id)
  return { targetId: target.id, created, inactiveMeasure, updatedMeasure, group, observed,
    invalidLatexCode, persisted: { revision: persisted.revision, objects: persisted.document.objects } }
}
