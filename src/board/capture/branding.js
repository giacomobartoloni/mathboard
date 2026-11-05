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

import { BOARD_THEMES } from '../../config/themes.js'
import { captureError } from './contract.js'

/**
 * Compose a detached, non-overlapping branding header in final-PNG pixel space.
 * The grid matches DrawBoard's 40px light theme pattern, independent of scene
 * coordinates, board theme, live zoom and capture scale.
 */
export function composeBrandedCapture(document, boardPixels, branding) {
  const { headerHeightPx, logoRectPx, contentRectPx }=branding
  const output=document.createElement('canvas')
  output.width=contentRectPx.width
  output.height=headerHeightPx+contentRectPx.height
  const ctx=output.getContext('2d')
  if(!ctx) throw captureError('capture_failed','Unable to create branded screenshot canvas.')

  ctx.fillStyle=BOARD_THEMES.light.background
  ctx.fillRect(0,0,output.width,headerHeightPx)
  ctx.strokeStyle=BOARD_THEMES.light.grid
  ctx.lineWidth=1
  ctx.beginPath()
  for(let x=0;x<output.width;x+=40) {
    ctx.moveTo(x+0.5,0)
    ctx.lineTo(x+0.5,headerHeightPx)
  }
  for(let y=0;y<headerHeightPx;y+=40) {
    ctx.moveTo(0,y+0.5)
    ctx.lineTo(output.width,y+0.5)
  }
  ctx.stroke()

  // The badge reproduces the styled Satisfy wordmark in App.vue. Scale the
  // detached drawing, never the board pixels; do not load remote assets.
  ctx.save()
  ctx.translate(logoRectPx.x,logoRectPx.y)
  ctx.scale(logoRectPx.width/160,logoRectPx.height/56)
  ctx.beginPath()
  ctx.roundRect(2,2,156,52,8)
  ctx.fillStyle='rgb(61, 61, 61)'
  ctx.shadowColor='rgba(0, 0, 0, 0.15)'
  ctx.shadowBlur=12
  ctx.shadowOffsetY=4
  ctx.fill()
  ctx.shadowColor='transparent'
  ctx.shadowBlur=0
  ctx.shadowOffsetY=0
  ctx.strokeStyle='tan'
  ctx.lineWidth=4
  ctx.stroke()
  ctx.fillStyle='whitesmoke'
  ctx.font='24px Satisfy'
  ctx.textAlign='center'
  ctx.textBaseline='middle'
  const textWidth=ctx.measureText('MathBoard').width
  if(textWidth>126) ctx.font=`${Math.floor(24*126/textWidth)}px Satisfy`
  ctx.fillText('MathBoard',80,28)
  ctx.restore()

  // This drawImage never scales: every captured RGBA pixel remains unchanged
  // at precisely y = branding.headerHeightPx in the final PNG.
  ctx.drawImage(boardPixels,0,headerHeightPx)
  return output
}
