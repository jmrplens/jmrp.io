/**
 * Utility to extract icons from dynamic content data.
 * Helps UnoCSS find icons that are only referenced in YAML/JSON data.
 */

/**
 * Recursively find all 'icon' fields in an object.
 */
export function extractIcons(data: unknown): string[] {
  const icons = new Set<string>();

  function walk(obj: unknown) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }

    const record = obj as Record<string, unknown>;
    for (const key in record) {
      const value = record[key];
      if (key === "icon" && typeof value === "string") {
        icons.add(value);
      } else {
        walk(value);
      }
    }
  }

  walk(data);
  return [...icons];
}
