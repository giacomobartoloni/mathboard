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

export const BOARD_CONTROLLER_ERROR_CODES = Object.freeze({
  NOT_READY: 'board_not_ready',
  INVALID_SPEC: 'invalid_object_spec',
  OBJECT_NOT_FOUND: 'object_not_found',
  NESTED_OBJECT_UNSUPPORTED: 'nested_object_mutation_not_supported',
  INVALID_PATCH: 'invalid_object_patch',
  FORMULA_RENDER_FAILED: 'formula_render_failed',
  COMMIT_FAILED: 'board_commit_failed',
})

export class BoardControllerError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'BoardControllerError'
    this.code = code
  }
}
