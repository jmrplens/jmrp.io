/**
 * HTML Utilities
 *
 * Shared helper functions for HTML manipulation and safety across scripts.
 */

import he from "he";

/**
 * Escapes HTML special characters to prevent XSS.
 * Uses the 'he' package for a robust implementation.
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return he.encode(str);
}

/**
 * Decodes HTML entities back to their original characters.
 */
export function decodeHtml(str) {
  if (typeof str !== "string") return "";
  return he.decode(str);
}
