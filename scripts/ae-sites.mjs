/**
 * The edge sites ae-to-influx.mjs ingests, the Cloudflare account each
 * dataset lives in, and the window each one reads.
 *
 * An Analytics Engine dataset belongs to the account whose Worker writes it,
 * so a site in another account is read there (the Global API Key reaches
 * both). Each site keeps its own window end in the state file: a site whose
 * query fails keeps its end and is read again from there on the next run,
 * while the others move on. The shared `lastEnd` still drives the
 * aggregated measurements of the `cloudflare` database and seeds a site that
 * has no end of its own yet, so adding a site needs no backfill.
 */

/** The jmrp.io account (Home Servers): jmrp.io, mcp.jmrp.io, docs.jmrp.io. */
export const DEFAULT_ACCOUNT = "d3604ab61425cd17ccc0c6b2f14ec1dd";

/**
 * Every edge worker that keeps a per-request log with the shared blob
 * layout, and the nginx_access identity its edge-served rows carry.
 * mcp.jmrp.io's worker started logging on 2026-09-05; before that there is
 * nothing to ingest for it.
 */
export const EDGE_SITES = Object.freeze([
  {
    dataset: "jmrp_edge_requests",
    site: "jmrp",
    host: "jmrp.io",
    account: DEFAULT_ACCOUNT,
  },
  {
    dataset: "mcp_edge_requests",
    site: "mcp",
    host: "mcp.jmrp.io",
    account: DEFAULT_ACCOUNT,
  },
  // docs.jmrp.io (since 2026-10-14) is GitHub Pages behind a pass-through
  // logging worker (workers/docs-edge): no nginx ever sees it, so EVERY
  // request is ingested, not only the edge-only verdicts. Its cache column
  // carries Cloudflare's raw cf-cache-status (HIT, MISS, DYNAMIC...).
  {
    dataset: "docs_edge_requests",
    site: "docs",
    host: "docs.jmrp.io",
    account: DEFAULT_ACCOUNT,
    ingestAll: true,
  },
  // phonometry.dev (since 2026-11-18): the documentation's preview, a
  // Worker in the Phonometry account that writes docs-edge's layout for the
  // files agents read and for the page views its beacon reports (verdict
  // `beacon`). Pages are static assets that reach no code, so every row is
  // ingested; beacon rows carry six more doubles (BEACON_COLUMNS). Its
  // dataset is new: until a query of it has answered once, the answers
  // Analytics Engine gives before the first row (FIRST_ROW_PENDING) are an
  // empty window, not a failure.
  {
    dataset: "phonometry_dev_requests",
    site: "phonometry-dev",
    host: "phonometry.dev",
    account: "4dbfb3b955a0c856bfe066f2a6061dd5",
    ingestAll: true,
    beacon: true,
    awaitsFirstRow: true,
  },
]);

/**
 * What the Analytics Engine SQL API answers for a dataset that has no row
 * yet: `Authorization error` while no dataset exists in the account, and
 * `unable to find type of column` right after the first write.
 */
export const FIRST_ROW_PENDING = Object.freeze([
  /Authorization error/u,
  /unable to find type of column/u,
]);

/**
 * Whether a failed query only means the site's dataset has no row yet: the
 * site waits for its first row, no query of it has answered before (the
 * state's `answered` list), and the error is one of FIRST_ROW_PENDING. Such
 * a window is empty and keeps the site's end; any other failure, and any
 * failure once the dataset has answered, is a failure.
 *
 * @param {{dataset: string, awaitsFirstRow?: boolean}} site - The site.
 * @param {{answered?: string[]} | null} state - The state file, or null.
 * @param {string} message - The error message.
 * @returns {boolean} True when the window is only empty.
 */
export function firstRowPending(site, state, message) {
  if (!site.awaitsFirstRow) return false;
  if ((state?.answered ?? []).includes(site.dataset)) return false;
  return FIRST_ROW_PENDING.some((pattern) => pattern.test(message));
}

/**
 * Collects every site's rows on its own: one site that fails does not stop
 * the others, and what the rest returned is kept.
 *
 * @param {object[]} sites - The sites.
 * @param {(site: object) => Promise<string[]>} collect - One site's lines.
 * @returns {Promise<{lines: string[], failed: {site: object, error: Error}[]}>} The lines and the sites that failed.
 */
export async function collectSites(sites, collect) {
  const settled = await Promise.allSettled(sites.map((site) => collect(site)));
  const lines = [];
  const failed = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") lines.push(...result.value);
    else failed.push({ site: sites[i], error: result.reason });
  });
  return { lines, failed };
}

/** Doubles 10 to 15 of a beacon row: load time, screen, viewport, pixel ratio. */
export const BEACON_COLUMNS =
  "double10 AS load_ms, double11 AS screen_w, double12 AS screen_h, double13 AS viewport_w, double14 AS viewport_h, double15 AS dpr";

/**
 * The window a site reads in this run.
 *
 * @param {{lastEnd?: number, sites?: Record<string, number>} | null} state - The state file, or null on a first run.
 * @param {{dataset: string}} site - The site.
 * @param {number} toS - The run's window end, epoch seconds.
 * @param {number} maxWindowS - The longest window read at once.
 * @returns {[number, number] | null} [from, to), or null when there is nothing to read yet.
 */
export function siteWindow(state, site, toS, maxWindowS) {
  const own = state?.sites?.[site.dataset];
  const shared = state?.lastEnd;
  let fromS = toS - maxWindowS;
  if (Number.isSafeInteger(shared)) fromS = shared;
  if (Number.isSafeInteger(own)) fromS = own;
  fromS = Math.max(fromS, toS - maxWindowS);
  return fromS < toS ? [fromS, toS] : null;
}

/**
 * The state to save after a run: the shared end moves to toS, each site's
 * end moves only when its rows were written.
 *
 * @param {{lastEnd?: number, sites?: Record<string, number>} | null} state - The state read at the start.
 * @param {number} toS - The run's window end.
 * @param {Record<string, boolean>} written - Dataset name to whether its rows were written.
 * @param {Record<string, number>} [starts] - Dataset name to the start of the window it tried; a failed
 *   site with no end of its own yet keeps that start, so its first window is read again.
 * @param {Record<string, boolean>} [answered] - Dataset name to whether its query answered in this run;
 *   kept in `answered`, the datasets whose failures always count (firstRowPending).
 * @returns {{lastEnd: number, sites: Record<string, number>, answered: string[]}} The new state.
 */
export function nextState(state, toS, written, starts = {}, answered = {}) {
  const sites = {};
  for (const site of EDGE_SITES) {
    const previous =
      state?.sites?.[site.dataset] ?? state?.lastEnd ?? starts[site.dataset];
    sites[site.dataset] = written[site.dataset] ? toS : (previous ?? toS);
  }
  const seen = new Set(state?.answered);
  for (const [dataset, yes] of Object.entries(answered)) {
    if (yes) seen.add(dataset);
  }
  return {
    lastEnd: toS,
    sites,
    answered: [...seen].sort((a, b) => a.localeCompare(b)),
  };
}
