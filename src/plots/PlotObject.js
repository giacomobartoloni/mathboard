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

import { Group, classRegistry } from 'fabric'
import { plotSemanticProps } from './plotSpec.js'
export class PlotObject extends Group {
  constructor(objects, options = {}) {
    const { plotSpec, ...rest } = options
    super(objects, { ...rest, subTargetCheck: false, interactive: false })
    this.objectKind = 'plot'
    this.plotSpec = plotSemanticProps(plotSpec)
    this.mathboardInkMode = options.mathboardInkMode || 'auto'
    this.plotBoardInk = options.plotBoardInk || '#333333'
    this.plotBoardBackground = options.plotBoardBackground
    this.getObjects().forEach((o) => o.set({ selectable: false, evented: false }))
  }
  applyInk(color) {
    this.plotBoardInk = color
    this.getObjects().forEach((o) => {
      if (o.plotBackground) return
      if (o.plotCurve && this.plotSpec.color !== 'auto') return
      const patch = {}
      if (o.stroke && o.stroke !== 'transparent') patch.stroke = color
      if (o.fill && o.fill !== 'transparent') patch.fill = color
      o.set(patch)
      o.dirty = true
    })
    this.dirty = true
  }
  applyTheme(config) {
    this.applyInk(config.defaultInk)
    this.plotBoardBackground = config.background
    const surface = this.getObjects().find(o => o.plotBackground)
    if (surface) {
      surface.set({ fill: this.plotSpec.transparentBackground ? 'transparent' : config.background, opacity: 1 })
      surface.dirty = true
    }
    this.dirty = true
  }
  toObject(props = []) {
    return super.toObject([...props, 'objectKind', 'plotSpec', 'mathboardInkMode', 'plotBoardInk', 'plotBoardBackground'])
  }
  static async fromObject(serialized) {
    const { buildPlotObject } = await import('./buildPlotObject.js')
    const { objects, type, plotSpec, ...options } = serialized
    void objects
    void type
    return buildPlotObject({ ...plotSpec, ...options, type: 'plot' })
  }
}
PlotObject.type = 'MathBoardPlot'
classRegistry.setClass(PlotObject, PlotObject.type)
