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

import { Rect, Path, Text, Circle } from 'fabric'
import { BOARD_THEMES } from '../config/themes.js'
import { PlotObject } from './PlotObject.js'
import { computePlotAsync } from './PlotComputation.js'
import { plotSemanticProps } from './plotSpec.js'
import { TRANSFORM_KEYS } from '../board/objects/constants.js'
export async function buildPlotObject(spec, options = {}) {
  const data = await computePlotAsync(spec, options)
  if (options.signal?.aborted || (options.expiresAtMs !== undefined && Date.now() >= options.expiresAtMs)) {
    throw Object.assign(new Error('Plot request timed out.'), { code: 'command_timeout' })
  }
  const ink = spec.plotBoardInk || '#333333'
  const background = spec.plotBoardBackground || BOARD_THEMES.light.background
  const color = spec.color && spec.color !== 'auto' ? spec.color : ink,
    width = spec.frame.width,
    height = spec.frame.height
  // Keep the frame-sized surface for consistent bounds; transparency reveals the board grid.
  const surface = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width, height,
    fill: spec.transparentBackground === true ? 'transparent' : background, opacity: 1, stroke: null, strokeWidth: 0 })
  surface.plotBackground = true
  const objects = [surface]
  const path = (d, opacity, strokeWidth, stroke = ink) =>
    new Path(d, { fill: null, stroke, strokeWidth, opacity, strokeUniform: true })
  if (data.grid.length) objects.push(path(data.grid.join(' '), 0.14, 1))
  // Border and surface transparency are independent presentation options.
  if (spec.border !== false) objects.push(
    new Rect({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width,
      height,
      fill: null,
      stroke: ink,
      strokeWidth: 1,
      opacity: 0.3
    })
  )
  if (data.axes.length) objects.push(path(data.axes.join(' '), 0.65, 1))
  data.curves.forEach((d) => {
    const curve = path(d, 1, 2, color)
    curve.plotCurve = true
    objects.push(curve)
  })
  data.dots.forEach((p) => {
    const dot = new Circle({
      left: p.x,
      top: p.y,
      radius: 1.7,
      originX: 'center',
      originY: 'center',
      fill: color,
      stroke: null
    })
    dot.plotCurve = true
    objects.push(dot)
  })
  data.labels.forEach((label) =>
    objects.push(
      new Text(label.text, {
        left: label.x,
        top: label.y,
        fontSize: 11,
        fontFamily: 'Arial',
        fill: ink,
        originX: 'center',
        originY: 'center'
      })
    )
  )
  const transform = Object.fromEntries(
    [...TRANSFORM_KEYS, 'opacity'].filter((k) => spec[k] !== undefined).map((k) => [k, spec[k]])
  )
  const object = new PlotObject(objects, {
    originX: 'left',
    originY: 'top',
    ...transform,
    plotSpec: plotSemanticProps(spec),
    plotBoardInk: ink,
    plotBoardBackground: background,
    mathboardInkMode: spec.color && spec.color !== 'auto' ? 'fixed' : 'auto'
  })
  object.plotStatus = data.status
  return object
}
