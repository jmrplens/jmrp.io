import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import type { Plugin, ViteDevServer } from "vite";

import { formatValue } from "../../scripts/ghc/format.mjs";

/**
 * Dev-only substitution of `PRJ_*` SSR tokens (see
 * `src/components/projects/ssr-tokens.ts`) — the /projects "no client JS"
 * contract means every live figure ships as a raw placeholder string in the
 * built HTML and markdown twin, normally replaced by nginx's
 * `body_filter_by_lua` at serve time. `astro dev`/`astro preview` have no
 * nginx in front of them, so without this plugin the owner would see literal
 * `PRJ_CODE_MERGED` text while iterating locally — exactly the behavior
 * `/homelab/`'s `HLM_*` tokens already have (and keep having: this plugin
 * never touches that prefix), documented as expected in CLAUDE.md.
 *
 * This plugin closes that gap for `PRJ_*` ONLY, reading the same
 * `.cache/ghc/projects-summary.json` the (future) nginx Lua module reads, so
 * dev preview shows real numbers instead of tokens or an invented mock.
 *
 * ── Why this can never run in production ────────────────────────────────
 * `apply: "serve"` is a Vite plugin-filtering field: Vite excludes this
 * plugin from the plugin list ENTIRELY for `vite build` (what `astro build`
 * runs under the hood), not merely a runtime `if (dev)` branch inside it. A
 * production build's plugin array never contains this object, so there is no
 * code path in a built artifact that could perform this substitution — the
 * safety property `plan/projects-ghchronicle/PLAN.md` asks for ("must be
 * impossible to run in production builds").
 *
 * ── How it works ─────────────────────────────────────────────────────────
 * `configureServer` returns a function, which Vite calls AFTER its own
 * internal middlewares (including Astro's SSR renderer) are installed — the
 * documented technique for post-processing a response Astro already
 * produced. The middleware wraps `res.write`/`res.end` to buffer an
 * `text/html` or `text/markdown` response body, then replaces every
 * `PRJ_[A-Z0-9_]+` token with the matching value from the summary file (or an
 * em dash for an unknown token, the same "never leak a placeholder" rule
 * `write-summary.mjs` documents for nginx). Every other response (JS, CSS,
 * images, JSON) passes through untouched and unbuffered.
 *
 * ── Formatting ────────────────────────────────────────────────────────────
 * The summary file holds RAW values (a plain integer, a raw ISO timestamp),
 * not display text — the same split `homelab_ssr_metrics.lua` makes between
 * its cached payloads and what it substitutes. This plugin formats each raw
 * value through `scripts/ghc/format.mjs`'s `formatValue(token, raw, locale)`
 * before substitution, so dev/preview shows "16 days ago" /
 * "hace 16 días", not a bare "16" — see that module's doc comment for the
 * full formatting spec and the note that the future nginx Lua module must
 * mirror it. The locale is derived from the request path (`/es/` prefix),
 * mirroring `homelab_ssr_metrics.lua`'s own `ngx.var.uri:find("^/es/")`.
 *
 * @module
 */

/** Same contract as the `PRJ_[A-Z0-9_]+` pattern in ssr-tokens.ts. */
const PRJ_TOKEN_RE = /PRJ_[A-Z0-9_]+/g;

/** Relative path of the live summary `write-summary.mjs` writes. */
const SUMMARY_PATH = ".cache/ghc/projects-summary.json";

/** Placeholder rendered for a token this plugin cannot resolve. */
const FALLBACK = "—"; // em dash, matching the nginx Lua contract

/** One token's raw value, exactly as `write-summary.mjs` writes it — not
 * yet formatted for display. */
type RawTokenValue = number | string | null;

/**
 * Reads the live summary's RAW token map, tolerating a missing or malformed
 * file (a fresh clone that has never run `write-summary.mjs`) by returning
 * an empty map — every token then falls back to {@link FALLBACK}, which is
 * still more honest than a raw `PRJ_*` string. Values are returned exactly
 * as written (not yet stringified/formatted): {@link substitutePrjTokens}
 * formats each one through `formatValue()` at substitution time, once the
 * request's locale is known.
 *
 * @param root - Project root (Vite's resolved `config.root`).
 * @returns Token name → raw value.
 */
function loadTokens(root: string): Record<string, RawTokenValue> {
  try {
    const raw = fs.readFileSync(path.join(root, SUMMARY_PATH), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const tokens =
      typeof parsed === "object" && parsed !== null && "tokens" in parsed
        ? parsed.tokens
        : undefined;
    if (typeof tokens !== "object" || tokens === null) return {};
    const out: Record<string, RawTokenValue> = {};
    for (const [key, value] of Object.entries(
      tokens as Record<string, unknown>,
    )) {
      out[key] = toRawTokenValue(value);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Narrows a decoded JSON value to {@link RawTokenValue}. `write-summary.mjs`
 * only ever writes `number | string | null` into the summary, so anything
 * else (an object, say, from a malformed hand-edited file) is treated the
 * same as a missing value rather than passed through.
 *
 * @param value - The raw JSON value for one token.
 * @returns The value, or `null` for anything not a plain primitive.
 */
function toRawTokenValue(value: unknown): RawTokenValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }
  return null;
}

/**
 * Derives the request's locale from its path, the same rule
 * `homelab_ssr_metrics.lua` uses for `HLM_*`: an `/es/` prefix (or the bare
 * `/es` route) is Spanish, everything else is English — including the
 * `/es/projects/index.md` markdown twin, which carries the same prefix.
 *
 * @param url - The incoming request's `url`, as Node/Vite gives it.
 * @returns `"es"` or `"en"`.
 */
function localeFromUrl(url: string | undefined): "en" | "es" {
  return url !== undefined && /^\/es(\/|$)/.test(url) ? "es" : "en";
}

/**
 * Whether a response's `content-type` header is one this plugin rewrites.
 *
 * @param contentType - Raw header value, possibly `undefined`.
 * @returns True for HTML documents and the `.md` markdown twins.
 */
function isRewritable(
  contentType: string | number | string[] | undefined,
): boolean {
  const value = String(contentType ?? "");
  return value.includes("text/html") || value.includes("text/markdown");
}

/**
 * Coerces one `res.write`/`res.end` chunk argument to a `Buffer`, the same
 * way Node's own response stream does internally.
 *
 * @param chunk - Whatever the caller passed to `write`/`end`.
 * @returns The chunk as a `Buffer` (empty when it was neither a Buffer nor
 *   a string).
 */
function toBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") return Buffer.from(chunk, "utf8");
  // Astro's dev SSR pipes the response body from a Web Streams
  // `ReadableStream` (`Readable.fromWeb(...).pipe(res)`), whose chunks
  // arrive as plain `Uint8Array`, not a Node `Buffer` — `Buffer.isBuffer()`
  // is `false` for those even though `Buffer` is itself a `Uint8Array`
  // subclass, so this branch is load-bearing, not defensive: without it
  // every chunk fell through to the empty-string case below and the whole
  // response body was silently dropped.
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  return Buffer.alloc(0);
}

/**
 * Replaces every `PRJ_*` token in a response body with its formatted value
 * from the live summary, or {@link FALLBACK} for a token the summary does
 * not declare.
 *
 * @param body - The full, already-buffered response body.
 * @param root - Project root, for locating the summary file.
 * @param locale - The request's locale, for `formatValue()`.
 * @returns The body with every token substituted.
 */
function substitutePrjTokens(
  body: string,
  root: string,
  locale: "en" | "es",
): string {
  if (!PRJ_TOKEN_RE.test(body)) return body;
  const tokens = loadTokens(root);
  return body.replaceAll(PRJ_TOKEN_RE, (match) =>
    match in tokens ? formatValue(match, tokens[match], locale) : FALLBACK,
  );
}

/**
 * Wraps one response's `write`/`end` so an HTML or markdown body is buffered
 * in full and substituted before it reaches the client, instead of being
 * streamed straight through. Every other response passes through untouched.
 *
 * @param req - The incoming request, for {@link localeFromUrl}.
 * @param res - The outgoing Node response, as Vite's middleware gives it.
 * @param root - Project root, for locating the summary file.
 */
function interceptPrjTokens(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
): void {
  const locale = localeFromUrl(req.url);
  const chunks: Buffer[] = [];
  let buffering = false;
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (!isRewritable(res.getHeader("content-type"))) {
      return (originalWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }
    buffering = true;
    chunks.push(toBuffer(chunk));
    return true;
  }) as typeof res.write;

  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    const rewritable = buffering || isRewritable(res.getHeader("content-type"));
    if (!rewritable) {
      return (originalEnd as (...args: unknown[]) => ServerResponse)(
        chunk,
        ...rest,
      );
    }
    if (chunk) chunks.push(toBuffer(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    return originalEnd(substitutePrjTokens(body, root, locale));
  }) as typeof res.end;
}

/**
 * Creates the dev-only `PRJ_*` substitution plugin.
 *
 * @returns The Vite plugin, active only under `vite dev`/`astro dev`.
 */
export function devPrjTokenPlugin(): Plugin {
  return {
    name: "jmrp-dev-prj-tokens",
    // Excludes this plugin from `astro build`'s Vite instance entirely — see
    // the module doc comment above.
    apply: "serve",
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      // NOT deferred (no returned function): this wraps `res.write`/`res.end`
      // BEFORE Astro's own SSR-rendering middleware writes to them, which is
      // the opposite need from the documented "run after Vite's internal
      // middlewares" pattern (that pattern is for a FALLBACK route reached
      // only when nothing else matched; this plugin instead has to intercept
      // a response an EARLIER middleware is about to produce). Astro's own
      // dev SSR handler defers itself the documented way, so running
      // undeferred here reliably places this middleware ahead of it in the
      // connect stack.
      server.middlewares.use((req, res, next) => {
        interceptPrjTokens(req, res, root);
        next();
      });
    },
  };
}
