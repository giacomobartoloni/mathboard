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

export const BOARD_OBJECT_TYPES = Object.freeze([
  'rect',
  'circle',
  'line',
  'path',
  'text',
  'formula',
  'group',
])

export const TRANSFORM_KEYS = Object.freeze([
  'left',
  'top',
  'scaleX',
  'scaleY',
  'skewX',
  'skewY',
  'angle',
  'flipX',
  'flipY',
  'originX',
  'originY',
])

export const STYLE_KEYS = Object.freeze([
  'stroke',
  'fill',
  'strokeWidth',
  'opacity',
  'strokeDashArray',
  'strokeLineCap',
  'strokeLineJoin',
])

export const TEXT_KEYS = Object.freeze([
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAlign',
  'lineHeight',
  'charSpacing',
  'underline',
  'linethrough',
  'overline',
])
