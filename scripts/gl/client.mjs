/**
 * A small, read-only GitLab.com API client for the /projects contribution
 * data: GET requests only (REST and GraphQL-over-GET), a per-request
 * timeout, one retry when a request is aborted by that timeout, and
 * `x-next-page` pagination.
 *
 * The client keeps no mutable state between calls, so several requests may
 * run at once from `runWithConcurrency` without sharing anything.
 *
 * The token (`GITLAB_COM_TOKEN_READ_ONLY`, `read_api` scope) travels only in
 * the `PRIVATE-TOKEN` header. It never appears in a URL, a log line or an
 * error message: every error this module throws names the PATH it asked for
 * (never the query string, which carries user ids and GraphQL bodies) and
 * the HTTP status.
 *
 * @module
 */

/** Public GitLab.com API origin. */
export const GITLAB_ORIGIN = "https://gitlab.com";

/** Per-request timeout. */
const DEFAULT_TIMEOUT_MS = 20_000;

/** Hard stop for pagination, so a server bug can never loop forever. */
const MAX_PAGES = 50;

/** Environment variable holding the read-only token. */
export const TOKEN_ENV = "GITLAB_COM_TOKEN_READ_ONLY";

/**
 * @typedef {object} GitlabClient
 * @property {(path: string, params?: Record<string, string | number>) => Promise<unknown>} get
 *   One REST GET under `/api/v4`, parsed JSON.
 * @property {(path: string, params?: Record<string, string | number>) => Promise<unknown[]>} getAll
 *   Every page of a paginated REST list, concatenated.
 * @property {(query: string) => Promise<Record<string, unknown>>} graphql
 *   One GraphQL query sent as a GET, returning `data`.
 */

/**
 * Whether an error is the abort a timed-out `AbortSignal` raises.
 *
 * @param {unknown} error - Anything thrown by `fetch`.
 * @returns {boolean} True for a timeout/abort.
 */
function isAbort(error) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * Builds a REST URL under `/api/v4` with its query parameters.
 *
 * @param {string} path - Path under `/api/v4`, starting with `/`.
 * @param {Record<string, string | number>} [params] - Query parameters.
 * @returns {URL} The full URL.
 */
function apiUrl(path, params = {}) {
  const url = new URL(`/api/v4${path}`, GITLAB_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

/**
 * Builds a client. Throws when no token is configured, so a caller can fall
 * back to its committed snapshot instead of silently publishing zeros.
 *
 * @param {object} [options] - Options.
 * @param {string} [options.token] - Token; defaults to `process.env[TOKEN_ENV]`.
 * @param {typeof fetch} [options.fetchImpl] - Injectable `fetch`, for tests.
 * @param {number} [options.timeoutMs] - Per-request timeout.
 * @returns {GitlabClient} The client.
 */
export function createGitlabClient({
  token = process.env[TOKEN_ENV],
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!token) throw new Error(`${TOKEN_ENV} is not set`);

  /**
   * GETs `url` with one retry on abort; returns the Response when OK.
   *
   * @param {URL} url - Absolute URL.
   * @returns {Promise<Response>} The successful response.
   */
  async function request(url) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        if (!response.ok) {
          throw new Error(`GitLab ${url.pathname}: HTTP ${response.status}`);
        }
        return response;
      } catch (error) {
        if (attempt === 0 && isAbort(error)) continue;
        if (isAbort(error)) {
          throw new Error(`GitLab ${url.pathname}: timed out twice`);
        }
        throw error;
      }
    }
  }

  return {
    async get(path, params) {
      const response = await request(apiUrl(path, params));
      return response.json();
    },

    async getAll(path, params = {}) {
      /** @type {unknown[]} */
      const rows = [];
      let page = "1";
      for (let n = 0; n < MAX_PAGES && page; n += 1) {
        const response = await request(
          apiUrl(path, { per_page: 100, ...params, page }),
        );
        const body = await response.json();
        if (!Array.isArray(body)) {
          throw new TypeError(`GitLab ${path}: expected a JSON array`);
        }
        rows.push(...body);
        page = response.headers.get("x-next-page") ?? "";
      }
      return rows;
    },

    async graphql(query) {
      const url = new URL("/api/graphql", GITLAB_ORIGIN);
      url.searchParams.set("query", query);
      const response = await request(url);
      const body =
        /** @type {{data?: Record<string, unknown>, errors?: unknown[]}} */ (
          await response.json()
        );
      if (body.errors?.length || !body.data) {
        throw new Error("GitLab /api/graphql: the query returned errors");
      }
      return body.data;
    },
  };
}
