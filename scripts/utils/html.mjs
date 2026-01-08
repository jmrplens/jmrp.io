/**
 * HTML Utilities
 *
 * Shared helper functions for HTML manipulation and safety across scripts.
 */

import he from "he";

/**
 * Escapes HTML special characters to prevent XSS.
 * Uses the 'he' package for a robust implementation.
 *
 * @param {string|undefined|null} str - The string to escape.
 * @returns {string} The escaped string, or an empty string if input is invalid.
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return he.encode(str);
}

/**
 * Decodes HTML entities back to their original characters.
 *
 * @param {string|undefined|null} str - The string to decode.
 * @returns {string} The decoded string, or an empty string if input is invalid.
 */
export function decodeHtml(str) {
  if (typeof str !== "string") return "";
  return he.decode(str);
}
