// @ts-check
/** @typedef {import("./app.js").Nav} Nav */
// Settings surface: the device's theme. An accent from tokens.css, and a mode that follows the
// device or overrides it. A choice applies at once and is kept on this device only.
import { backButton, bind } from "../../src/client/ui/controls.js";
import { applyTheme, readTheme, saveTheme } from "../../src/client/ui/theme.js";
import { ACCENTS, MODES, THEME_COLORS } from "../../src/shared/theme.js";

/** @typedef {import("../../src/shared/theme.js").Accent} Accent */
/** @typedef {import("../../src/shared/theme.js").Mode} Mode */

/** Each accent's --a-acc in each scheme, from tokens.css, so a swatch shows what the app will paint. */
const ACCENT_SWATCH = {
  bronze: { light: "#6b4a1a", dark: "#d9aa55" },
  ink: { light: "#3d3227", dark: "#ddd0ba" },
  brick: { light: "#8c3f2b", dark: "#e59685" },
  olive: { light: "#47591f", dark: "#adc77a" },
};

/**
 * The scheme on screen: the forced mode, or the device's when the theme follows it.
 * @param {Mode} mode
 * @returns {"light" | "dark"}
 */
function scheme(mode) {
  if (mode !== "device") return mode;
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const MODE_SWATCH = {
  device:
    `linear-gradient(135deg, ${THEME_COLORS.light} 50%, ${THEME_COLORS.dark} 50%)`,
  light: THEME_COLORS.light,
  dark: THEME_COLORS.dark,
};

const MODE_NAMES = { device: "Device", light: "Light", dark: "Dark" };

/** @param {string} name */
function titleCase(name) {
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * @param {string} action
 * @param {string} label
 * @param {string} background
 * @param {boolean} on
 */
function swatch(action, label, background, on) {
  return `<button class="swatch" data-action="${action}" aria-pressed="${on}"><i style="background:${background}"></i>${label}</button>`;
}

/**
 * @param {HTMLElement} root
 * @param {Nav} nav
 */
export function renderSettings(root, nav) {
  const theme = readTheme();
  const accents = ACCENTS.map((accent) =>
    swatch(
      `accent:${accent}`,
      titleCase(accent),
      ACCENT_SWATCH[accent][scheme(theme.mode)],
      theme.accent === accent,
    )
  ).join("");
  const modes = MODES.map((mode) =>
    swatch(
      `mode:${mode}`,
      MODE_NAMES[mode],
      MODE_SWATCH[mode],
      theme.mode === mode,
    )
  ).join("");
  const intro =
    '<div><p class="eyebrow">Settings</p><h1>Appearance</h1><p>Kept on this device only.</p></div>';
  const accentGroup =
    `<div role="group" aria-labelledby="accent-label"><h2 id="accent-label">Accent</h2><div class="themeshelf">${accents}</div></div>`;
  const modeGroup =
    `<div role="group" aria-labelledby="mode-label"><h2 id="mode-label">Mode</h2><p>Device follows this phone's light or dark setting.</p><div class="themeshelf">${modes}</div></div>`;
  root.innerHTML = `<section class="page overview settings">${
    backButton("shelf", "Back to shelf")
  }${intro}${accentGroup}${modeGroup}</section>`;
  bind(root, (action) => handle(action, root, nav), () => {});
}

/**
 * @param {string} action
 * @param {HTMLElement} root
 * @param {Nav} nav
 */
function handle(action, root, nav) {
  if (action === "shelf") return nav.show("shelf", "/");
  const [kind, value] = action.split(":");
  const theme = readTheme();
  const accent = ACCENTS.find((name) => name === value);
  const mode = MODES.find((name) => name === value);
  if (kind === "accent" && accent) theme.accent = accent;
  else if (kind === "mode" && mode) theme.mode = mode;
  else return;
  saveTheme(theme);
  applyTheme(theme);
  renderSettings(root, nav);
}
