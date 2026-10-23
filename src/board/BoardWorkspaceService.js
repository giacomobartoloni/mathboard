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
 * Single application-level entry for library actions used by UI and the local agent.
 * Serializes transitions and metadata writes; BoardDocument remains a snapshot.
 */
export class BoardWorkspaceService {
  constructor(persistence) {
    this._persistence = persistence
    this._pending = Promise.resolve()
  }

  _run(operation) {
    const result = this._pending.then(operation)
    this._pending = result.then(() => {}, () => {})
    return result
  }

  _summary(record) {
    return {
      id: record.id,
      title: record.title,
      kind: record.kind || 'scratch',
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      isActive: record.id === this._persistence.boardId,
    }
  }

  list() {
    return this._run(() => this._persistence.listBoards())
  }

  create({ title } = {}) {
    return this._run(async () => this._summary(await this._persistence.createNewBoard(title)))
  }

  open({ boardId } = {}) {
    return this._run(async () => this._summary(await this._persistence.openBoard(boardId)))
  }

  rename({ boardId, title } = {}) {
    return this._run(async () => this._summary(await this._persistence.renameBoard(boardId, title)))
  }

  listTrash() {
    return this._run(() => this._persistence.listTrashedBoards())
  }

  trash({ boardId } = {}) {
    return this._run(async () => this._summary(await this._persistence.trashBoard(boardId)))
  }

  restore({ boardId } = {}) {
    return this._run(async () => this._summary(await this._persistence.restoreBoard(boardId)))
  }

  save() {
    return this._run(async () => this._summary(await this._persistence.saveCurrentBoard()))
  }
}
