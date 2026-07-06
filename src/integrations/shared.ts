/**
 * Small helpers shared between the `pre-build` and `post-build` Astro
 * integrations (both `astro:config:setup` and `astro:build:done` hooks).
 * Kept separate from `post-build/utils.ts` because `pre-build/` needs it too
 * and must not depend on the `post-build/` subtree (and vice versa).
 */

/**
 * Safely serializes an unknown value to a string.
 * Handles strings directly, uses JSON.stringify with a try/catch fallback
 * to prevent crashes on circular references, BigInt, or throwing toJSON.
 *
 * @param {unknown} value - The value to serialize.
 * @returns {string} A best-effort string representation of `value`.
 */
export function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
