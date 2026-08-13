/**
 * Homelab probed↔probe Sync Checker
 *
 * `/homelab/`'s "online" pill and KPI numerator come from nginx's health
 * probe (`/etc/nginx/lua/homelab_health.lua`, served at
 * `127.0.0.1:8999/stats/health`), while the KPI DENOMINATOR is the build-time
 * count of services flagged `probed: true` in
 * `src/components/pages/HomelabPage.astro`. The two rosters live in different
 * repos, so nothing structural stops them drifting — and a drift renders a
 * permanent fake outage ("n / n+1") or an impossible "n+1 / n" with no signal.
 *
 * This check closes that gap where it matters: it extracts the `probed: true`
 * service ids from the page source and compares them, as a SET, against the
 * keys the live probe actually reports. It runs meaningfully only where the
 * probe is reachable (the production server — the only place the page is
 * served with real metrics); anywhere else (CI runners, dev machines) the
 * fetch fails fast and the check SKIPS with exit 0, by design.
 *
 * Override the probe URL with `HOMELAB_HEALTH_URL` if the stats port moves.
 *
 * Run manually: `node scripts/ci/check-homelab-probe.mjs`
 * Wired into `pnpm verify` ("Lint: Homelab probe sync").
 */

import fs from "node:fs";
import path from "node:path";

const PAGE = path.join(process.cwd(), "src/components/pages/HomelabPage.astro");
const HEALTH_URL =
  process.env.HOMELAB_HEALTH_URL ?? "http://127.0.0.1:8999/stats/health";
const FETCH_TIMEOUT_MS = 4000;

/**
 * Extracts `{ id, probed }` pairs from the `const services: Service[]` array
 * literal in HomelabPage.astro.
 *
 * Not a real parser: it slices the array region, splits it into object
 * chunks on `id:` occurrences and reads each chunk's `probed:` flag. That is
 * enough because the services array is hand-maintained data with one `id:`
 * and one `probed:` per entry — and if the shape ever changes so much that
 * this misparses, the check fails loudly rather than silently passing.
 *
 * @param {string} source - The page source text.
 * @returns {{ id: string, probed: boolean }[]} The declared services.
 */
function extractServices(source) {
  const start = source.indexOf("const services: Service[]");
  if (start === -1)
    throw new Error("HomelabPage.astro: `const services: Service[]` not found");
  const end = source.indexOf("];", start);
  const region = source.slice(start, end);

  const services = [];
  const idPattern = /\bid:\s*"([^"]+)"/g;
  const matches = [...region.matchAll(idPattern)];
  for (const [index, match] of matches.entries()) {
    const chunk = region.slice(
      match.index,
      matches[index + 1]?.index ?? region.length,
    );
    const probed = /\bprobed:\s*(true|false)\b/.exec(chunk);
    if (!probed)
      throw new Error(
        `HomelabPage.astro: service "${match[1]}" has no probed flag`,
      );
    services.push({ id: match[1], probed: probed[1] === "true" });
  }
  if (services.length === 0)
    throw new Error("HomelabPage.astro: no services parsed");
  return services;
}

const services = extractServices(fs.readFileSync(PAGE, "utf8"));
const probedIds = new Set(
  services.filter((service) => service.probed).map((service) => service.id),
);

/** @type {{ services?: Record<string, boolean> } | undefined} */
let health;
try {
  const response = await fetch(HEALTH_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  health = await response.json();
} catch (error) {
  console.log(
    `↷ Homelab probe not reachable at ${HEALTH_URL} (${error.message}) — ` +
      "skipping the probed↔probe sync check (expected off the production host).",
  );
  process.exit(0);
}

const rosterIds = new Set(Object.keys(health?.services ?? {}));
const missingFromRoster = [...probedIds.difference(rosterIds)];
const missingFromPage = [...rosterIds.difference(probedIds)];

if (missingFromRoster.length === 0 && missingFromPage.length === 0) {
  console.log(
    `✅ Homelab probed roster in sync with the live probe (${[...probedIds].sort((a, b) => a.localeCompare(b)).join(", ")}).`,
  );
} else {
  if (missingFromRoster.length > 0)
    console.error(
      `✗ probed: true on the page but ABSENT from the probe: ${missingFromRoster.join(", ")}\n` +
        "  The KPI would render a permanent fake outage (probe online < page total).\n" +
        "  Fix: add the service to /etc/nginx/lua/homelab_health.lua, or set probed: false.",
    );
  if (missingFromPage.length > 0)
    console.error(
      `✗ probed by nginx but not flagged probed: true on the page: ${missingFromPage.join(", ")}\n` +
        '  The KPI numerator could exceed its denominator ("n+1 / n").\n' +
        "  Fix: flag the service probed: true, or drop it from homelab_health.lua.",
    );
  process.exitCode = 1;
}
