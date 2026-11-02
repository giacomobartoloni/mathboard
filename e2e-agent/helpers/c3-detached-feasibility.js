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

import { Canvas } from 'fabric'
import { BoardController } from '../../src/board/BoardController.js'
import { createMathBoardServices } from '../../src/core/createMathBoardServices.js'
import { materializeBoardDocument } from '../../src/board/persistence/materializeBoardDocument.js'
import { serializeBoardDocument } from '../../src/board/persistence/serializeBoardDocument.js'

export async function runDetachedFeasibility() {
  const { boardObjectPolicy, formulaRenderer } = createMathBoardServices()
  const buildFormula = async spec => {
    const formula = await formulaRenderer.render({ latex: spec.latex,
      position: { x: spec.left ?? 0, y: spec.top ?? 0 }, ink: '#000000' })
    formula.set({ ...spec, latex: spec.latex })
    formula.setCoords()
    return formula
  }
  const canvas = new Canvas(document.createElement('canvas'), { width: 640, height: 480 })
  const history = []
  try {
    const { objects } = await materializeBoardDocument({ format: 'mathboard-board', version: 1,
      title: 'Detached', objects: [
        { id: 'mbobj_one', type: 'rect', left: 10, top: 20, width: 20, height: 20 },
        { id: 'mbobj_two', type: 'rect', left: 40, top: 20, width: 20, height: 20 },
      ] }, { buildFormula })
    canvas.add(...objects)
    const controller = new BoardController({ getCanvas: () => canvas, boardObjectPolicy, buildFormula,
      pushHistoryCommand: command => history.push(command), isMutationStable: () => true,
      getBoardId: () => 'mb_detached' })
    const created = await controller.create({ type: 'rect', left: 70, top: 20, width: 20, height: 20 })
    const batch = await controller.createMany([
      { type: 'text', text: 'A', left: 100, top: 30 },
      { type: 'formula', latex: 'x^2=4', left: 120, top: 40 },
    ])
    await controller.update(created.id, { left: 80 })
    const measured = controller.measure(batch[1].id)
    const group = await controller.group(['mbobj_one', 'mbobj_two'])
    const beforeDelete = serializeBoardDocument({ canvas, boardObjectPolicy, title: 'Detached' })
    await controller.delete(batch[0].id)
    await controller.deleteMany([batch[1].id, created.id])
    await controller.clear()
    return { created, batch, measured, group, beforeDelete, afterClear: controller.observe(),
      historyCount: history.length, canvasAttached: canvas.wrapperEl?.isConnected ?? false }
  } finally {
    await canvas.dispose()
  }
}
