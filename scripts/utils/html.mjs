import he from "he";

/**
 * Escapes HTML special characters to prevent XSS.
 * Uses the 'he' package for a robust implementation.
 */
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return he.encode(str);
}
