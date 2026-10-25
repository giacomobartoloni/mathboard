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
