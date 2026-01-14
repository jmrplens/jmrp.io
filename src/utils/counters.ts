/**
 * Simple counter utility for accessibility labels
 */
const counters: Record<string, number> = {};

/**
 * Increments and returns a formatted counter (e.g., "0001")
 */
export function getNextIndex(key: string): string {
  if (!counters[key]) {
    counters[key] = 0;
  }
  counters[key]++;
  return counters[key].toString().padStart(4, "0");
}
