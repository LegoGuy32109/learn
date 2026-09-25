// @ts-check
// Reading parsed JSON, which is `unknown` (see types/strict-json.d.ts). Shared by the browser and the
// server, so both narrow a body the same way.

/**
 * A JSON object: not null, not an array.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One member of a JSON object, or undefined when the value is not an object.
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
export function field(value, key) {
  return isRecord(value) ? value[key] : undefined;
}
