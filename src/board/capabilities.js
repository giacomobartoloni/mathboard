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

/**
 * Capability flags describe whether an object may participate in an operation.
 * They do not dictate which contextual buttons to show (e.g. Formula is
 * groupable, but a single-formula panel still omits Group).
 */

export const FORMULA_CAPABILITIES = Object.freeze({
  edit: true,
  duplicate: true,
  delete: true,
  group: true,
  ungroup: false,
  recolor: false,
})

export const GROUP_CAPABILITIES = Object.freeze({
  edit: false,
  duplicate: true,
  delete: true,
  group: false,
  ungroup: true,
  recolor: true,
})

export const DRAWABLE_CAPABILITIES = Object.freeze({
  edit: false,
  duplicate: true,
  delete: true,
  group: true,
  ungroup: false,
  recolor: true,
})

export const TEXT_CAPABILITIES = Object.freeze({
  edit: false,
  duplicate: true,
  delete: true,
  group: true,
  ungroup: false,
  recolor: true,
})

export const UNKNOWN_CAPABILITIES = Object.freeze({
  edit: false,
  duplicate: true,
  delete: true,
  group: false,
  ungroup: false,
  recolor: false,
})
