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

  _run(operation, { signal } = {}) {
    const unknown = () => Object.assign(new Error('Board outcome requires readback.'), {
      code: 'execution_unknown',
    })
    const result = this._pending.then(async () => {
      if (signal?.aborted) throw unknown() // Revoked queued work must not begin.
      const value = await operation()
      if (signal?.aborted) throw unknown() // In-flight storage may still have committed.
      return value
    })
    this._pending = result.then(() => {}, () => {})
    return result
  }

  _summary(record) {
    return {
      id: record.id,
      title: record.title,
      createdAt: record.createdAt || null,
      updatedAt: record.updatedAt || null,
      isActive: record.id === this._persistence.boardId,
      ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
    }
  }

  list({ signal } = {}) {
    return this._run(() => this._persistence.listBoards(), { signal })
  }

  create({ title } = {}, { signal } = {}) {
    return this._run(async () => this._summary(await this._persistence.createNewBoard(title)), { signal })
  }

  open({ boardId } = {}, { signal } = {}) {
    return this._run(async () => this._summary(await this._persistence.openBoard(boardId)), { signal })
  }

  rename({ boardId, title } = {}, { signal } = {}) {
    return this._run(async () => this._summary(await this._persistence.renameBoard(boardId, title)), { signal })
  }

  listArchived({ signal } = {}) {
    return this._run(() => this._persistence.listArchivedBoards(), { signal })
  }

  archive({ boardId } = {}, { signal } = {}) {
    return this._run(async () => this._summary(await this._persistence.archiveBoard(boardId)), { signal })
  }

  unarchive({ boardId } = {}, { signal } = {}) {
    return this._run(async () => this._summary(await this._persistence.unarchiveBoard(boardId)), { signal })
  }

  delete({ boardId, confirm } = {}, { signal } = {}) {
    return this._run(() => this._persistence.deleteBoard(boardId, { confirm }), { signal })
  }

}
