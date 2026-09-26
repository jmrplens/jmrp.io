/**
 * Locale-aware formatting for `PRJ_*` SSR token VALUES — the shared spec
 * between `vite-plugin-dev-prj-tokens.ts` (which uses this module directly
 * in `astro dev`/`astro preview`) and the future
 * `/etc/nginx/lua/projects_ssr_metrics.lua` (a later task, which cannot
 * `require()` a `.mjs` file and must port {@link kindForToken} and
 * {@link formatValue} to Lua by hand — see the "Lua mirror" section below).
 *
 * `homelab_ssr_metrics.lua` is the established sibling contract for
 * `/homelab/`: it formats every `HLM_*` value locale-aware BEFORE nginx
 * substitutes it, so components render the token verbatim and never
 * re-format it themselves. This module gives `/projects/`'s `PRJ_*` tokens
 * the same guarantee, minus the `bytes`/`pct`/`temp` kinds `/homelab/` needs
 * and doesn't — `/projects/` only ever shows counts, version tags, a
 * relative release age and a timestamp.
 *
 * ── Kinds ─────────────────────────────────────────────────────────────────
 * - `"int"`        — grouped thousands, locale separator: `12,345` (en) /
 *   `12.345` (es). Mirrors `homelab_ssr_metrics.lua`'s `int` formatter.
 * - `"int-signed"` — same grouping, with a leading `+` for a positive value
 *   (`0` and negative values are not prefixed). Used for the activity band's
 *   site-wide `PRJ_STARS_30D` tile, which has no surrounding "+{count}"
 *   translation string to add the sign — contrast with the PER-CARD
 *   `PRJ_<ID>_STARS_30D`, which stays plain `"int"` because
 *   `pages.projects.card.stars30dSuffix` ("+{count} in 30 d") already
 *   supplies the `+`; giving that token `int-signed` too would double it.
 * - `"tag"`         — pass-through string, unchanged: release tags
 *   (`v3.0.0`) and the `*_CLASS` tokens (`""` / `"prj-hide"`), which are
 *   already-decided CSS class names, never locale text.
 * - `"rel-days"`    — a complete, standalone relative-age PHRASE (not just a
 *   number): `"today"` / `"1 day ago"` / `"16 days ago"` (en),
 *   `"hoy"` / `"hace 1 día"` / `"hace 16 días"` (es). Unlike `stars30d`,
 *   `PRJ_<ID>_REL_AGE` is rendered bare by `CardLiveBox.astro`
 *   (`{ssr.relTag} · {ssr.relAge}`) with no wrapping translation string, so
 *   the full phrase — words and all — has to come from here.
 * - `"as-of"`       — `PRJ_AS_OF`: `"YYYY-MM-DD HH:MM UTC+2"`, in
 *   Europe/Madrid local time regardless of the host's own timezone (the site
 *   is authored in Valencia; the dev machine or CI runner may not be). Same
 *   shape as `HLM_AS_OF`, deliberately: both tokens feed a "Live … updated
 *   {time}" sentence and a bare `Live: {time}` line in the markdown twin
 *   (`projects-markdown.ts`), so a reader comparing `/homelab/` and
 *   `/projects/` sees one time format, not two.
 *
 * ── Adding a token ────────────────────────────────────────────────────────
 * New tokens need no change here UNLESS they need a kind other than the
 * default (`"int"`): {@link kindForToken} dispatches on the token's own
 * name/suffix (`_REL_AGE`, `_REL_TAG`, `_CLASS`, or the literal `PRJ_AS_OF`
 * / `PRJ_STARS_30D`), not on a hand-maintained per-token table — a token
 * ending `_STARS` or `_STARS_30D` (per-card) or any of the flat counters
 * (`PRJ_CODE_MERGED`, `PRJ_RELEASES_90D`, …) all fall through to `"int"`
 * with no entry needed.
 *
 * ── Lua mirror (later task) ──────────────────────────────────────────────
 * `projects_ssr_metrics.lua` must reproduce {@link kindForToken}'s suffix
 * dispatch and every formatter in {@link formatValue} byte-for-byte:
 * `group_thousands` and `fmt_decimal` already exist in
 * `homelab_ssr_metrics.lua` and can be reused directly; `rel-days` and
 * `as-of` are new and have no Lua equivalent yet. Keep the exact wording
 * (`"today"`/`"hoy"`, `"day ago"`/`"día"` singular vs `"days ago"`/`"días"`
 * plural) — `CardLiveBox.astro` and `projects-markdown.ts` render whatever
 * this returns verbatim.
 *
 * @module
 */

/** IANA zone the site's dates are authored in (Valencia), independent of
 * the host's own timezone — see the `"as-of"` kind above. */
const TIME_ZONE = "Europe/Madrid";

/** Rendered for a `null`/`undefined`/unparsable raw value, any kind — same
 * "out-of-sync or missing data degrades to a dash, never garbage" contract
 * as `homelab_ssr_metrics.lua`'s `DASH`. */
const DASH = "—";

/**
 * Groups an integer's digits by thousands using the locale's separator:
 * `,` for English, `.` for Spanish — the same table `group_thousands` in
 * `homelab_ssr_metrics.lua` implements in Lua.
 *
 * @param {number} value - A finite number (rounded to the nearest integer).
 * @param {"en" | "es"} locale - Target locale.
 * @returns {string} The grouped digits, with a leading `-` for a negative
 *   value.
 */
function groupThousands(value, locale) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded).toString();
  const separator = locale === "es" ? "." : ",";
  const grouped = digits.replaceAll(/\B(?=(\d{3})+(?!\d))/g, () => separator);
  return sign + grouped;
}

/**
 * `"int"` kind: grouped thousands, no sign.
 *
 * @param {number} value - Raw numeric value.
 * @param {"en" | "es"} locale - Target locale.
 * @returns {string} e.g. `"12,345"` / `"12.345"`.
 */
function formatInt(value, locale) {
  return groupThousands(value, locale);
}

/**
 * `"int-signed"` kind: grouped thousands, `+` prefix for a positive value.
 * Zero and negative values are never prefixed (`groupThousands` already
 * supplies the `-` sign for negatives).
 *
 * @param {number} value - Raw numeric value.
 * @param {"en" | "es"} locale - Target locale.
 * @returns {string} e.g. `"+42"`, `"0"`, `"-3"`.
 */
function formatIntSigned(value, locale) {
  const grouped = groupThousands(value, locale);
  return value > 0 ? `+${grouped}` : grouped;
}

/**
 * `"rel-days"` kind: a full, standalone relative-age phrase.
 *
 * @param {number} value - Age in days (rounded; a non-positive value reads
 *   as "today"/"hoy" rather than a negative age).
 * @param {"en" | "es"} locale - Target locale.
 * @returns {string} e.g. `"today"`, `"1 day ago"`, `"16 days ago"` (en);
 *   `"hoy"`, `"hace 1 día"`, `"hace 16 días"` (es).
 */
function formatRelDays(value, locale) {
  const days = Math.round(value);
  if (locale === "es") {
    if (days <= 0) return "hoy";
    if (days === 1) return "hace 1 día";
    return `hace ${groupThousands(days, locale)} días`;
  }
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${groupThousands(days, locale)} days ago`;
}

/**
 * Parses an InfluxDB timestamp string into a `Date`. InfluxDB 3 returns up
 * to 9 fractional digits (nanoseconds) and no explicit zone — e.g.
 * `"2026-09-26T13:03:19.304686700"` — which `new Date()` does not parse
 * reliably (it silently drops digits past the third and, more importantly,
 * treats a zone-less string as LOCAL time, not UTC). This normalizes the
 * fraction to milliseconds and assumes UTC (InfluxDB always stores in UTC)
 * when no zone is present, then hands the result to `Date` for the actual
 * parse.
 *
 * @param {unknown} raw - The raw token value.
 * @returns {Date | null} The parsed instant, or `null` when `raw` is not a
 *   parsable timestamp string.
 */
function parseAsOfTimestamp(raw) {
  if (typeof raw !== "string" || raw === "") return null;

  // Split in three simple steps rather than one combined regex (base +
  // optional fraction + optional zone): a single pattern covering all three
  // trips `sonarjs/regex-complexity` and is harder to read besides.
  const baseMatch = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.exec(raw);
  if (!baseMatch) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const base = baseMatch[0];
  const rest = raw.slice(base.length);

  const fractionMatch = /^\.\d+/.exec(rest);
  const fraction = fractionMatch?.[0] ?? "";
  const millis = fraction === "" ? "000" : fraction.slice(1, 4).padEnd(3, "0");
  const afterFraction = rest.slice(fraction.length);

  // InfluxDB never sends a zone (always UTC, per the module doc comment),
  // but a zone-carrying string is still accepted correctly rather than
  // parsed wrong.
  const zone = /^(?:Z|[+-]\d{2}:?\d{2})$/.test(afterFraction)
    ? afterFraction
    : "Z";

  const parsed = new Date(`${base}.${millis}${zone}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The UTC offset of `date` IN {@link TIME_ZONE}, formatted `"UTC+2"` /
 * `"UTC-3:30"` / `"UTC"` — same notation `homelab_ssr_metrics.lua`'s
 * `utc_offset` uses, computed from the host's local `/etc/localtime` there.
 * This instead asks `Intl` for Europe/Madrid's offset explicitly, so the
 * result is identical whether this runs on the production host, a
 * worktree, or a CI runner in an arbitrary timezone.
 *
 * @param {Date} date - The instant to resolve the offset for (DST-aware).
 * @returns {string} The formatted offset.
 */
function utcOffsetInTimeZone(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = tzName.match(/^GMT([+-]\d+)(?::(\d+))?$/);
  if (!match) return "UTC";
  const [, hours, minutes] = match;
  return minutes ? `UTC${hours}:${minutes}` : `UTC${hours}`;
}

/**
 * `"as-of"` kind: `PRJ_AS_OF` rendered as local (Europe/Madrid) date, time
 * and UTC offset — mirrors `HLM_AS_OF`'s shape exactly (see the module doc
 * comment) so both tokens feed a "Live … updated {time}" sentence the same
 * way.
 *
 * @param {unknown} raw - The raw ISO-ish timestamp string.
 * @returns {string} e.g. `"2026-09-26 15:03 UTC+2"`, or {@link DASH} when
 *   `raw` cannot be parsed.
 */
function formatAsOf(raw) {
  const date = parseAsOfTimestamp(raw);
  if (!date) return DASH;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  // `hour12: false` renders midnight as "24" in some ICU versions instead
  // of "00" — normalize it so the as-of line never reads "24:03".
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${day} ${hour}:${get("minute")} ${utcOffsetInTimeZone(date)}`;
}

/**
 * Determines which formatting KIND a `PRJ_*` token needs, from the token's
 * own name — see the module doc comment's "Adding a token" section for why
 * this is suffix dispatch rather than a hand-maintained per-token table.
 *
 * @param {string} token - A `PRJ_[A-Z0-9_]+` token name.
 * @returns {"int" | "int-signed" | "tag" | "rel-days" | "as-of"} The kind.
 */
export function kindForToken(token) {
  if (token === "PRJ_AS_OF") return "as-of";
  // The site-wide activity-band tile only, NOT the per-card
  // `PRJ_<ID>_STARS_30D` (which ends the same way but is never an exact
  // match for this literal) — see the module doc comment.
  if (token === "PRJ_STARS_30D") return "int-signed";
  if (token.endsWith("_REL_AGE")) return "rel-days";
  if (token.endsWith("_REL_TAG")) return "tag";
  if (token.endsWith("_CLASS")) return "tag";
  return "int";
}

/**
 * Formats one `PRJ_*` token's raw value for display, dispatching on
 * {@link kindForToken}. This is the single function both
 * `vite-plugin-dev-prj-tokens.ts` and the future nginx Lua module must call
 * (or mirror) for every token — see the module doc comment.
 *
 * @param {string} token - The `PRJ_*` token name.
 * @param {number | string | null | undefined} raw - The raw value, exactly
 *   as `write-summary.mjs`'s `buildSummaryTokens()` writes it.
 * @param {"en" | "es"} [locale] - Target locale; anything other than
 *   `"es"` is treated as `"en"`.
 * @returns {string} The formatted display string, or {@link DASH} for a
 *   missing/unparsable value.
 */
export function formatValue(token, raw, locale) {
  const resolvedLocale = locale === "es" ? "es" : "en";
  const kind = kindForToken(token);

  if (kind === "as-of") return formatAsOf(raw);

  if (kind === "tag") {
    // Unlike every other kind, an empty string is a legitimate "tag" value
    // (a `*_CLASS` token's SHOW_CLASS, written literally by
    // `write-summary.mjs`), not a stand-in for missing data — only
    // null/undefined degrade to the dash here.
    if (raw === null || raw === undefined) return DASH;
    return String(raw);
  }

  if ([null, undefined, ""].includes(raw)) return DASH;

  const numeric = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numeric)) return DASH;

  if (kind === "int-signed") return formatIntSigned(numeric, resolvedLocale);
  if (kind === "rel-days") return formatRelDays(numeric, resolvedLocale);
  return formatInt(numeric, resolvedLocale);
}
