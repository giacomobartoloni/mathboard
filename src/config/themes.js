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

/**
 * Theme configuration and preference persistence for Dark Mode v2.
 *
 * Two independent concepts:
 * - uiTheme: application chrome (panels, modals, controls). Never touches Fabric objects.
 * - boardTheme: canvas appearance (background, grid) and the DEFAULT ink used for
 *   objects created while that board theme is active. Existing document objects keep
 *   their own colors regardless of theme changes.
 *
 * Preferences are stored as explicit string values, never booleans.
 */

export const UI_THEMES = ['light', 'dark'];
export const DEFAULT_UI_THEME = 'light';

export const BOARD_THEMES = {
  light: {
    label: 'Light',
    background: '#f9f9f9',
    grid: '#e0e0e0',
    defaultInk: '#000000',
  },
  dark: {
    label: 'Dark',
    background: '#1e1e22',
    grid: '#333338',
    defaultInk: '#f5f5f5',
  },
  chalkboard: {
    label: 'Chalkboard',
    background: '#244a3b',
    grid: '#315e4c',
    defaultInk: '#f4f1de',
  },
};

export const BOARD_THEME_ORDER = ['light', 'dark', 'chalkboard'];
export const DEFAULT_BOARD_THEME = 'light';

export const THEME_STORAGE_KEYS = {
  uiTheme: 'mathboard_ui_theme',
  boardTheme: 'mathboard_board_theme',
  legacyDarkMode: 'mathboard_dark_mode',
};

export function normalizeUiTheme(value) {
  return UI_THEMES.includes(value) ? value : DEFAULT_UI_THEME;
}

export function normalizeBoardTheme(value) {
  return Object.prototype.hasOwnProperty.call(BOARD_THEMES, value)
    ? value
    : DEFAULT_BOARD_THEME;
}

function readStoredValue(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error(`Unable to read theme preference "${key}"`, error);
    return null;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Unable to persist theme preference "${key}"`, error);
  }
}

/**
 * Load persisted theme preferences, performing a one-time migration of the
 * legacy boolean preference "mathboard_dark_mode".
 *
 * - A stored new-format value always wins.
 * - When a new key is missing and the legacy key is "true", that theme defaults to dark.
 * - Unknown/invalid stored values fall back to light.
 * - The legacy key is left in place (harmless) but is never the source of truth again.
 */
export function loadThemePreferences() {
  const legacyDarkMode = readStoredValue(THEME_STORAGE_KEYS.legacyDarkMode) === 'true';

  const storedUiTheme = readStoredValue(THEME_STORAGE_KEYS.uiTheme);
  const storedBoardTheme = readStoredValue(THEME_STORAGE_KEYS.boardTheme);

  const uiTheme = storedUiTheme === null
    ? (legacyDarkMode ? 'dark' : DEFAULT_UI_THEME)
    : normalizeUiTheme(storedUiTheme);

  const boardTheme = storedBoardTheme === null
    ? (legacyDarkMode ? 'dark' : DEFAULT_BOARD_THEME)
    : normalizeBoardTheme(storedBoardTheme);

  if (storedUiTheme !== uiTheme) {
    writeStoredValue(THEME_STORAGE_KEYS.uiTheme, uiTheme);
  }
  if (storedBoardTheme !== boardTheme) {
    writeStoredValue(THEME_STORAGE_KEYS.boardTheme, boardTheme);
  }

  return { uiTheme, boardTheme };
}

export function saveUiTheme(value) {
  writeStoredValue(THEME_STORAGE_KEYS.uiTheme, normalizeUiTheme(value));
}

export function saveBoardTheme(value) {
  writeStoredValue(THEME_STORAGE_KEYS.boardTheme, normalizeBoardTheme(value));
}
