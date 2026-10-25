import test from 'node:test'
import assert from 'node:assert/strict'
import { CLOUD_SYNC_STATUSES, getBoardStorageNotice } from '../src/board/storage/boardStorageNotice.js'

test('web storage notice describes local-only boards, no sync, and clearing site data', () => {
  const notice = getBoardStorageNotice()
  assert.equal(notice.title, 'Saved on this device')
  assert.match(notice.summary, /No cloud sync/)
  assert.match(notice.localLocation, /in this browser/)
  assert.match(notice.cloudExplanation, /not upload your board documents/)
  assert.match(notice.cloudExplanation, /not appear automatically on other devices/)
  assert.match(notice.dataWarning, /Clearing browser or site data/)
})

test('Tauri storage notice refers to the native app rather than the browser', () => {
  const notice = getBoardStorageNotice({ isDesktop: true })
  assert.match(notice.localLocation, /MathBoard app/)
  assert.doesNotMatch(notice.localLocation, /browser/)
  assert.match(notice.dataWarning, /Removing app data or uninstalling/)
})

test('cloud copy is data-driven and independent from local storage', () => {
  const expected = {
    [CLOUD_SYNC_STATUSES.OFF]: /No cloud sync/,
    [CLOUD_SYNC_STATUSES.SYNCED]: /Synced to cloud/,
    [CLOUD_SYNC_STATUSES.SYNCING]: /Syncing to cloud/,
    [CLOUD_SYNC_STATUSES.WAITING]: /Waiting to sync/,
    [CLOUD_SYNC_STATUSES.ERROR]: /Cloud sync failed/,
  }
  for (const [status, summary] of Object.entries(expected)) {
    const notice = getBoardStorageNotice({ cloudSyncStatus: status })
    assert.match(notice.summary, summary)
    assert.equal(notice.title, 'Saved on this device')
  }
  assert.throws(() => getBoardStorageNotice({ cloudSyncStatus: 'unknown' }), RangeError)
})
