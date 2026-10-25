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

const TRACK_EVENT_COMMAND = 'track_desktop_analytics_event'

export function createDesktopAnalyticsTransport(invokeCommand = invoke) {
  return {
    track(event, metadata, appVersion) {
      // Invocation is fire-and-forget: offline or transport failures never block editing.
      void Promise.resolve()
        .then(() => invokeCommand(TRACK_EVENT_COMMAND, {
          event,
          metadata: { ...metadata, runtime: 'desktop', app_version: appVersion },
        }))
        .catch(() => {})
    },
  }
}

export const desktopAnalyticsTransport = createDesktopAnalyticsTransport()
