/**
 * Minimal InfluxDB 3 (Core/Enterprise) SQL query client for the ghchronicle
 * `github` database.
 *
 * Read-only, GET requests against `/api/v3/query_sql?db=...&q=...` (verified
 * against the live instance on 2026-09-26: `INFLUX_URL` defaults to
 * `http://192.168.0.40:50107`, the same host `plan/projects-ghchronicle/`
 * measured against). This mirrors the query shape nginx's
 * `homelab_common.lua` already uses against the Core node at `:50102` — same
 * endpoint, same `{q, db}` payload, same Bearer token — except here it is a
 * plain HTTP GET from Node instead of an internal nginx location capture,
 * because this module runs at build time / from a systemd timer, never in
 * the request path of a page.
 *
 * The token is never logged, never included in an error message, and never
 * written to any file this module produces — see `datos.md` "Nunca
 * publicar": the InfluxDB token, host or port must not reach any generated
 * file, Lua comment or markdown twin.
 *
 * @module
 */

/**
 * Default InfluxDB 3 instance for the ghchronicle `github` database. Plain
 * HTTP is intentional: this is a LAN-only host (`192.168.0.40`), never
 * reachable from the public internet — the same trust boundary
 * `homelab_common.lua` assumes for the Core node at `:50102`.
 */
// eslint-disable-next-line sonarjs/no-clear-text-protocols -- internal LAN host, not public internet
export const DEFAULT_INFLUX_URL = "http://192.168.0.40:50107";

/** Database queried throughout this pipeline. */
export const DEFAULT_INFLUX_DB = "github";

/** Query timeout: long enough for the slowest tested query (~2 s), short
 * enough that a stuck connection cannot hang a pre-build step or a systemd
 * timer indefinitely. */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Raised when an InfluxDB query fails (non-2xx, timeout, or unparsable body).
 * The message never includes the token; it may include the SQL text, which
 * is fine, it never carries secrets or private-repo identifiers by
 * construction (every query here filters through the roster allowlist).
 */
export class InfluxQueryError extends Error {
  /**
   * Builds the error.
   *
   * @param {string} message - Human-readable failure summary.
   * @param {object} [options] - Error options.
   * @param {unknown} [options.cause] - The underlying error, if any.
   */
  constructor(message, options) {
    super(message, options);
    this.name = "InfluxQueryError";
  }
}

/**
 * Connection settings for {@link queryInflux}, resolved once by callers from
 * environment variables (see `resolveInfluxConfig`) and threaded through.
 *
 * @typedef {object} InfluxConfig
 * @property {string} url - Base URL; see {@link DEFAULT_INFLUX_URL}.
 * @property {string} token - Bearer token (read-only, per PLAN.md 8.2 #2).
 * @property {string} [db] - Database name; defaults to {@link DEFAULT_INFLUX_DB}.
 */

/**
 * Resolves {@link InfluxConfig} from the environment.
 *
 * `GHC_INFLUX_TOKEN` is the token variable this pipeline uses; for local
 * development, `source /etc/ghchronicle/ghchronicle.env` and export its
 * `INFLUX_TOKEN` under that name (see the module doc of `write-summary.mjs`).
 * `INFLUX_URL` overrides the default host for a non-production dev box.
 *
 * @param {NodeJS.ProcessEnv} [env] - Defaults to `process.env`.
 * @returns {InfluxConfig} Resolved configuration.
 * @throws {Error} When no token is available.
 */
export function resolveInfluxConfig(env = process.env) {
  const token = env.GHC_INFLUX_TOKEN ?? env.INFLUX_TOKEN;
  if (!token) {
    throw new Error(
      "influx.mjs: no InfluxDB token in the environment. Set GHC_INFLUX_TOKEN " +
        "(or INFLUX_TOKEN), e.g. by sourcing /etc/ghchronicle/ghchronicle.env.",
    );
  }
  return {
    url: env.INFLUX_URL ?? DEFAULT_INFLUX_URL,
    token,
    db: env.GHC_INFLUX_DB ?? DEFAULT_INFLUX_DB,
  };
}

/** Delay before the single retry after an aborted (timed-out) query. */
const RETRY_DELAY_MS = 500;

/**
 * Whether `error` is (or, for an {@link InfluxQueryError}, wraps via its
 * `cause`) a fetch abort — i.e. the request's own `AbortController` firing
 * because it outran {@link DEFAULT_TIMEOUT_MS}, not a real server error.
 * Only this case is worth retrying: a non-2xx response or an unparsable
 * body will fail again identically.
 *
 * @param {unknown} error - The error to inspect.
 * @returns {boolean} True for an abort/timeout.
 */
function isAbortError(error) {
  if (error instanceof Error && error.name === "AbortError") return true;
  return (
    error instanceof InfluxQueryError &&
    error.cause instanceof Error &&
    error.cause.name === "AbortError"
  );
}

/**
 * Waits for `ms` milliseconds.
 *
 * @param {number} ms - Milliseconds to wait.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one read-only SQL query and returns its rows.
 *
 * Every caller in `queries.mjs` passes SQL that carries an explicit
 * `time >=` bound (the InfluxDB 3 Parquet-file limit bites otherwise — see
 * `datos.md`, "Problemas de calidad de datos" in several families) and an
 * explicit roster `IN (...)` filter built by `roster.mjs`. This function does
 * not enforce either; it is a thin transport.
 *
 * Retries ONCE, after {@link RETRY_DELAY_MS}, when the failure was an abort
 * (the request outran {@link DEFAULT_TIMEOUT_MS}) — see
 * `scripts/ghc/concurrency.mjs`'s doc comment for why a query that would
 * succeed alone can time out under concurrent load even after capping it. A
 * non-abort failure (a real 4xx/5xx, an unparsable body) is never retried;
 * it would just fail again the same way.
 *
 * @param {string} sql - The SQL query text (no trailing semicolon needed).
 * @param {InfluxConfig} config - Connection settings.
 * @returns {Promise<Record<string, unknown>[]>} Decoded rows.
 * @throws {InfluxQueryError} On a non-2xx response, timeout or bad body.
 */
export async function queryInflux(sql, config) {
  try {
    return await queryInfluxOnce(sql, config);
  } catch (error) {
    if (!isAbortError(error)) throw error;
    await sleep(RETRY_DELAY_MS);
    return queryInfluxOnce(sql, config);
  }
}

/**
 * One attempt at {@link queryInflux}, with no retry — the actual transport.
 *
 * @param {string} sql - The SQL query text.
 * @param {InfluxConfig} config - Connection settings.
 * @returns {Promise<Record<string, unknown>[]>} Decoded rows.
 * @throws {InfluxQueryError} On a non-2xx response, timeout or bad body.
 */
async function queryInfluxOnce(sql, config) {
  const { url, token, db = DEFAULT_INFLUX_DB } = config;
  const endpoint = new URL("/api/v3/query_sql", url);
  endpoint.searchParams.set("db", db);
  endpoint.searchParams.set("q", sql);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (error) {
    throw new InfluxQueryError(
      `InfluxDB query failed to send (${db}): ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new InfluxQueryError(
      `InfluxDB query returned ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) {
      throw new TypeError("response body is not a JSON array");
    }
    return rows;
  } catch (error) {
    throw new InfluxQueryError(
      `InfluxDB query returned an unparsable body: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
}

/**
 * Runs a query and returns a single scalar from its first row, or
 * `undefined` when the query returned no rows. Numbers may arrive as JSON
 * numbers or as strings (InfluxDB 3's `approx_median`/float columns do
 * both — see `datos.md` "Numbers returned by SQL can be floats or
 * strings"), so this coerces to `Number` when the column looks numeric.
 *
 * @param {string} sql - The SQL query text.
 * @param {InfluxConfig} config - Connection settings.
 * @param {string} column - The column to read from the first row.
 * @returns {Promise<unknown>} The scalar value, or `undefined`.
 */
export async function queryScalar(sql, config, column) {
  const rows = await queryInflux(sql, config);
  const value = rows[0]?.[column];
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return Number(value);
  }
  return value;
}
