// @ts-check
// The app theme: an accent from tokens.css and a mode that follows the device or overrides it. The
// choice belongs to one device, so the browser keeps it in localStorage; the server only needs these
// names to render the boot script that applies it before the first paint.

/** @typedef {"bronze" | "ink" | "brick" | "olive"} Accent */
/** @typedef {"device" | "light" | "dark"} Mode */
/** @typedef {{ accent: Accent, mode: Mode }} Theme */

/** @type {readonly Accent[]} */
export const ACCENTS = ["bronze", "ink", "brick", "olive"];
/** @type {readonly Mode[]} */
export const MODES = ["device", "light", "dark"];
/** @type {Theme} */
export const DEFAULT_THEME = { accent: "bronze", mode: "device" };
export const THEME_KEY = "learn-theme";

/** The browser status-bar colour for each scheme; the page background of tokens.css. */
export const THEME_COLORS = { light: "#eae2d3", dark: "#1c1812" };

/**
 * A stored theme, with anything unknown replaced by the default. Stored values outlive the code that
 * wrote them, so a removed accent or a hand-edited value falls back instead of breaking the page.
 * @param {unknown} value
 * @returns {Theme}
 */
export function parseTheme(value) {
  const record = value !== null && typeof value === "object"
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
  const accent = ACCENTS.find((name) => name === record.accent);
  const mode = MODES.find((name) => name === record.mode);
  return {
    accent: accent ?? DEFAULT_THEME.accent,
    mode: mode ?? DEFAULT_THEME.mode,
  };
}
