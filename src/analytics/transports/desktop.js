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
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { invoke } from '@tauri-apps/api/core'
import { createDesktopEventSender } from './desktopSender.js'

export function createDesktopAnalyticsTransport({ invokeCommand = invoke, isOnline, doNotTrack } = {}) {
  const sendEvent = createDesktopEventSender({
    send: (event, metadata) => invokeCommand('track_desktop_analytics', { event, metadata }),
    isOnline,
    doNotTrack,
  })
  return { track: sendEvent }
}

export const desktopAnalyticsTransport = createDesktopAnalyticsTransport()
