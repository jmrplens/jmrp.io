/**
 * Simple counter utility for accessibility labels
 */
const counters: Record<string, number> = {};

/**
 * Increments and returns a formatted counter (e.g., "0001")
 */
export function getNextIndex(key: string): string {
  // Use nullish coalescing to handle legitimate zero values
  counters[key] = (counters[key] ?? 0) + 1;
  return counters[key].toString().padStart(4, "0");
}
