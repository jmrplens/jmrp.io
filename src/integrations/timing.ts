/**
 * Shared per-phase timing helper for Astro integration hooks.
 *
 * Used by both `pre-build.ts` (`astro:config:setup`) and `post-build.ts`
 * (`astro:build:done`) to log how long each phase takes, without adding any
 * new dependency. This is baseline telemetry only — no aggregation or
 * reporting is done here; see `scripts/deploy-live.mjs` for the equivalent
 * (but separate) telemetry used in the publish step.
 */

import type { AstroIntegrationLogger } from "astro";

/**
 * Runs `fn`, measuring its wall-clock duration with `performance.now()`, and
 * logs `  ⏱ {label}: {seconds}s` via the provided Astro integration logger.
 *
 * @param label - Human-readable phase name (e.g. "processHtmlFiles").
 * @param logger - Astro integration logger to report the timing to.
 * @param fn - Sync or async function to execute and time.
 * @returns The resolved return value of `fn`.
 */
export async function timed<T>(
  label: string,
  logger: AstroIntegrationLogger,
  fn: () => Promise<T> | T,
): Promise<T> {
  const t0 = performance.now();
  const result = await fn();
  logger.info(`  ⏱ ${label}: ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  return result;
}
