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

// BoardRecord lifecycle rules are pure and independent from persistence I/O.

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// Legacy trashedAt records are Archive entries and must never expire.
export function isArchivedBoardRecord(record) {
  return Boolean(record?.archivedAt || record?.trashedAt)
}

export function isTrashedBoardRecord(record) {
  return Boolean(record?.deletedAt)
}

export function isExpiredTrashedBoardRecord(record, nowMs) {
  if (!isTrashedBoardRecord(record) || !Number.isFinite(nowMs)) return false
  const deletedAtMs = Date.parse(record.deletedAt)
  return Number.isFinite(deletedAtMs) && deletedAtMs < nowMs - TRASH_RETENTION_MS
}

export function summarizeBoardRecord(record, activeBoardId) {
  return {
    id: record.id,
    title: record.title || 'Untitled board',
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    isActive: record.id === activeBoardId,
    ...(isArchivedBoardRecord(record) ? { archivedAt: record.archivedAt || record.trashedAt } : {}),
    ...(isTrashedBoardRecord(record) ? { deletedAt: record.deletedAt } : {}),
  }
}
