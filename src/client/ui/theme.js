// @ts-check
// Read, save and apply the device's theme. The boot script in src/server/views/page.ts applies the
// saved theme before the first paint; this module applies a change while the page is open.
import {
  DEFAULT_THEME,
  parseTheme,
  THEME_COLORS,
  THEME_KEY,
} from "../../shared/theme.js";

/** @typedef {import("../../shared/theme.js").Theme} Theme */

/**
 * The saved theme, or the default when storage is empty, blocked or holds something unreadable.
 * @param {Pick<Storage, "getItem">} [storage]
 * @returns {Theme}
 */
export function readTheme(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(THEME_KEY);
    return raw ? parseTheme(JSON.parse(raw)) : { ...DEFAULT_THEME };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/**
 * Keep the theme for the next load. A browser that refuses storage still gets the theme for this page.
 * @param {Theme} theme
 * @param {Pick<Storage, "setItem">} [storage]
 */
export function saveTheme(theme, storage = globalThis.localStorage) {
  try {
    storage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Private windows and blocked site data: the choice lasts until the page closes.
  }
}

/**
 * Put the theme on the document: the accent and the mode on <html>, and a status-bar colour that
 * matches a forced mode. Following the device removes the override and restores both media-matched
 * colours.
 * @param {Theme} theme
 * @param {Document} [doc]
 */
export function applyTheme(theme, doc = document) {
  const root = doc.documentElement;
  root.dataset.accent = theme.accent;
  if (theme.mode === "device") delete root.dataset.theme;
  else root.dataset.theme = theme.mode;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.getAttribute("media")?.includes("dark")
      ? "dark"
      : "light";
    meta.setAttribute(
      "content",
      THEME_COLORS[theme.mode === "device" ? scheme : theme.mode],
    );
  }
}
