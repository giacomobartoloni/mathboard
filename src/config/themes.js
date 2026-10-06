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
 * Presentation is driven by boardTheme (light / dark / chalkboard). The chrome
 * UI theme is derived from it (chalkboard uses dark chrome) so the two stay in
 * sync via the single theme-toggle control.
 *
 * Board ink authorship is tracked per Fabric object via the custom property
 * "mathboardInkMode" (see INK_MODE_AUTO / INK_MODE_FIXED). Objects authored with
 * the board default ink follow the board theme; objects whose ink the user chose
 * explicitly must never be rewritten by a theme change.
 *
 * Preferences are stored as explicit string values, never booleans.
 */

export const UI_THEMES = ['light', 'dark'];
export const DEFAULT_UI_THEME = 'light';

/**
 * Ink authorship stored on Fabric objects as the custom property "mathboardInkMode".
 *
 * - AUTO: the object was created with the board default ink and must follow the
 *   board theme whenever it changes.
 * - FIXED: the ink was chosen explicitly (pen palette, imported document); a board
 *   theme change must leave it untouched.
 */
export const INK_MODE_AUTO = 'auto';
export const INK_MODE_FIXED = 'fixed';

/**
 * `inkIsLight` states whether `defaultInk` is a light ink. Kept for callers that
 * still read polarity; vector formulas recolor via FormulaObject.applyInk and
 * do not use bitmap Invert filters.
 */
export const BOARD_THEMES = {
  light: {
    label: 'Light',
    background: '#f9f9f9',
    grid: '#e0e0e0',
    defaultInk: '#000000',
    inkIsLight: false,
  },
  dark: {
    label: 'Dark',
    background: '#1e1e22',
    grid: '#333338',
    defaultInk: '#f5f5f5',
    inkIsLight: true,
  },
  chalkboard: {
    label: 'Chalkboard',
    background: '#244a3b',
    grid: '#315e4c',
    defaultInk: '#f4f1de',
    inkIsLight: true,
  },
};

export const BOARD_THEME_ORDER = ['light', 'dark', 'chalkboard'];
export const DEFAULT_BOARD_THEME = 'light';

/**
 * Chrome UI paired with each board theme. Chalkboard keeps the dark chrome
 * so panels stay readable against the green canvas.
 */
export function uiThemeForBoardTheme(boardTheme) {
  return normalizeBoardTheme(boardTheme) === 'light' ? 'light' : 'dark';
}

export function cycleBoardTheme(current) {
  const normalized = normalizeBoardTheme(current);
  const index = BOARD_THEME_ORDER.indexOf(normalized);
  return BOARD_THEME_ORDER[(index + 1) % BOARD_THEME_ORDER.length];
}

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

  const boardTheme = storedBoardTheme === null
    ? (legacyDarkMode ? 'dark' : DEFAULT_BOARD_THEME)
    : normalizeBoardTheme(storedBoardTheme);

  // Presentation is driven by boardTheme; chrome UI is derived so the two
  // never drift (e.g. after the old independent toggle + select controls).
  const uiTheme = uiThemeForBoardTheme(boardTheme);

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
