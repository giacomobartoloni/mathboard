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

export const SNAP_PREFERENCE_KEY = 'mathboard_snap_to_grid';

/** Missing, malformed or inaccessible local preferences always start disabled. */
export function loadSnapPreference() {
  try {
    return typeof window !== 'undefined'
      && window.localStorage.getItem(SNAP_PREFERENCE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveSnapPreference(enabled) {
  try {
    if (typeof window === 'undefined') return false;
    window.localStorage.setItem(SNAP_PREFERENCE_KEY, enabled ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}
