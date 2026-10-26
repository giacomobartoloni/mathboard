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

export const CLOUD_SYNC_STATUSES = Object.freeze({
  OFF: 'off',
  SYNCED: 'synced',
  SYNCING: 'syncing',
  WAITING: 'waiting',
  ERROR: 'error',
})

const CLOUD_SUMMARIES = Object.freeze({
  off: 'No cloud sync · Not available on other devices',
  synced: 'Synced to cloud · Available on your devices',
  syncing: 'Syncing to cloud…',
  waiting: 'Waiting to sync · Boards remain stored locally',
  error: 'Cloud sync failed · Check sync settings',
})

export function getBoardStorageNotice({ isDesktop = false, cloudSyncStatus = CLOUD_SYNC_STATUSES.OFF } = {}) {
  if (!Object.prototype.hasOwnProperty.call(CLOUD_SUMMARIES, cloudSyncStatus)) {
    throw new RangeError('Unsupported cloud sync status')
  }
  return {
    title: 'Saved on this device',
    summary: CLOUD_SUMMARIES[cloudSyncStatus],
    localLocation: isDesktop
      ? 'Boards are stored locally in the MathBoard app on this device.'
      : 'Boards are stored locally in this browser on this device.',
    cloudExplanation: cloudSyncStatus === CLOUD_SYNC_STATUSES.OFF
      ? 'MathBoard does not upload your board documents to its cloud. Your boards will not appear automatically on other devices.'
      : 'Cloud synchronization is separate from local saving.',
    dataWarning: isDesktop
      ? 'Removing app data or uninstalling the app may remove your boards. Local storage is not a backup.'
      : 'Clearing browser or site data may remove your boards. Local storage is not a backup.',
  }
}
