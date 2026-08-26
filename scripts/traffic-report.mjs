/**
 * Daily traffic report → Telegram (same bot as csp-reporter).
 *
 * Collects the last 24 h from the TWO places that actually see traffic:
 *
 * - The edge-nonce Worker's request registry (Cloudflare Analytics Engine,
 *   dataset `jmrp_edge_requests`) — the FULL picture, because the edge cache
 *   answers most requests without ever touching this server. Queried over the
 *   SQL API with the Global Key from `.env`.
 * - nginx's origin access log — the half the edge can't tell: statuses (404s
 *   worth redirecting, 405 probe noise, 418 tarpit catches) and what actually
 *   reached the origin.
 *
 * Own traffic is excluded on both sides: loopback plus every address in
 * `/etc/nginx/snippets/trusted_ip_map_dynamic.conf` (the DDNS-managed file, so
 * a router IP change needs no edit here).
 *
 * Output: a compact summary MESSAGE (Telegram HTML) plus a self-contained
 * HTML report attached as a document — Telegram does not render HTML inline,
 * but attaches it one tap away; a PDF would need a headless browser for no
 * extra information.
 *
 * Wired to a systemd timer at 22:00 Europe/Madrid (the server's own TZ).
 * Run manually: `node scripts/traffic-report.mjs [--dry-run]`
 * (`--dry-run` prints the message and writes the HTML next to the script
 * instead of sending anything.)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

// ── Environment ─────────────────────────────────────────────────────────────
try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // Shell-provided env is fine too.
}
const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  PRIVATE_CF_API_TOKEN,
  PRIVATE_CF_EMAIL,
} = process.env;
const CF_ACCOUNT = "d3604ab61425cd17ccc0c6b2f14ec1dd";
const DRY_RUN = process.argv.includes("--dry-run");

const NGINX_LOGS = [
  "/var/log/nginx/jmrp.io_access.log",
  "/var/log/nginx/jmrp.io_access.log.1",
];
const TRUSTED_MAP = "/etc/nginx/snippets/trusted_ip_map_dynamic.conf";

// ── Own-traffic exclusion ───────────────────────────────────────────────────

/** Loads trusted addresses/prefixes; loopback is always excluded. */
function loadOwnAddresses() {
  const exact = new Set(["127.0.0.1", "::1"]);
  const prefixes = [];
  try {
    for (const line of fs.readFileSync(TRUSTED_MAP, "utf8").split("\n")) {
      const m = /^([0-9a-f.:]+)(\/\d+)?\s+1;/i.exec(line.trim());
      if (!m) continue;
      if (m[2]) prefixes.push(m[1].replace(/::$/u, ":").toLowerCase());
      else exact.add(m[1].toLowerCase());
    }
  } catch {
    // Without the map the report still works, just without the exclusion.
  }
  return { exact, prefixes };
}

const OWN = loadOwnAddresses();

/** True when the address is this household's own traffic. */
function isOwn(ip) {
  const a = ip.toLowerCase();
  if (OWN.exact.has(a)) return true;
  return OWN.prefixes.some((p) => a.startsWith(p));
}

// ── nginx origin log (last 24 h) ────────────────────────────────────────────

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};
const LINE =
  /^(\S+) \S+ \S+ \[(\d+)\/(\w+)\/(\d+):([\d:]+) [+-]\d+\] "(\w+) (\S*)[^"]*" (\d{3}) \d+ "[^"]*" "([^"]*)"/u;

/** Parses the origin logs into per-bucket aggregates for the window. */
function collectOrigin(sinceMs) {
  const agg = {
    total: 0,
    byStatus: new Map(),
    top404: new Map(),
    tarpit: new Map(),
    tarpitIps: new Set(),
    top405: new Map(),
    topPages: new Map(),
    mdTwins: new Map(),
    uas: new Map(),
  };
  const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
  for (const file of NGINX_LOGS) {
    let text;
    try {
      const raw = fs.readFileSync(file);
      text = file.endsWith(".gz")
        ? zlib.gunzipSync(raw).toString()
        : raw.toString();
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = LINE.exec(line);
      if (!m) continue;
      const [, ip, d, mon, y, hms, method, uri, status, ua] = m;
      const [hh, mm, ss] = hms.split(":");
      const ts = Date.UTC(+y, MONTHS[mon], +d, +hh, +mm, +ss);
      // The log offset is the server's own TZ and so is this process: local
      // Date.parse-free comparison is close enough for a daily window.
      if (ts < sinceMs) continue;
      if (isOwn(ip)) continue;
      agg.total += 1;
      bump(agg.byStatus, status);
      const clean = uri.split("?", 1)[0];
      switch (status) {
        case "404": {
          bump(agg.top404, clean);
          break;
        }
        case "418": {
          bump(agg.tarpit, clean);
          agg.tarpitIps.add(ip);

          break;
        }
        case "405": {
          bump(agg.top405, `${method} ${clean}`);
          break;
        }
        default: {
          if (status === "200" && clean.endsWith(".md"))
            bump(agg.mdTwins, clean);
          else if (
            status === "200" &&
            (clean.endsWith("/") || !clean.includes("."))
          ) {
            bump(agg.topPages, clean);
          }
        }
      }
      const uaShort = ua.length > 80 ? `${ua.slice(0, 77)}…` : ua;
      bump(agg.uas, uaShort);
    }
  }
  return agg;
}

// ── Worker registry (Analytics Engine) ──────────────────────────────────────

/** Runs one SQL query against the Analytics Engine SQL API. */
async function aeQuery(sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": PRIVATE_CF_EMAIL,
        "X-Auth-Key": PRIVATE_CF_API_TOKEN,
      },
      body: `${sql} FORMAT JSONEachRow`,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`AE ${res.status}: ${text.slice(0, 120)}`);
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const row = JSON.parse(l);
      // JSONEachRow serializes every aggregate as a string; coerce the count
      // so downstream reduces add numbers instead of concatenating text.
      if ("n" in row) row.n = Number(row.n);
      return row;
    });
}

/** Collects the edge-side aggregates for the last 24 h. */
async function collectEdge() {
  const W = "WHERE timestamp > NOW() - INTERVAL '24' HOUR";
  const [classes, topPages, twins, countries] = await Promise.all([
    aeQuery(
      `SELECT index1 AS c, blob2 AS ua, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} GROUP BY c, ua`,
    ),
    aeQuery(
      `SELECT blob1 AS p, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} AND index1 = 'page' GROUP BY p ORDER BY n DESC LIMIT 15`,
    ),
    aeQuery(
      `SELECT blob1 AS p, blob2 AS ua, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} AND index1 IN ('md-twin','llms-txt') GROUP BY p, ua ORDER BY n DESC LIMIT 15`,
    ),
    aeQuery(
      `SELECT blob3 AS cc, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} GROUP BY cc ORDER BY n DESC LIMIT 10`,
    ),
  ]);
  return { classes, topPages, twins, countries };
}

// ── Rendering ───────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Sorted [key, n] rows of a Map, biggest first. */
const rows = (map, limit) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

/* cspell:disable -- the message and report are user-facing Spanish;
   code and comments stay English per project rule. */
/** The compact Telegram message (parse_mode HTML). */
function buildMessage(edge, origin, date) {
  const edgeTotal = edge.classes.reduce((a, r) => a + r.n, 0);
  const edgeBots = edge.classes
    .filter((r) => r.ua === "bot")
    .reduce((a, r) => a + r.n, 0);
  const twinsTotal = edge.twins.reduce((a, r) => a + r.n, 0);
  const t404 = origin.byStatus.get("404") ?? 0;
  const t418 = origin.byStatus.get("418") ?? 0;
  const lines = [
    `<b>📊 jmrp.io — ${date}</b>`,
    "",
    `<b>Edge (worker)</b>: ${edgeTotal} peticiones · ${edgeBots} de bots`,
    `<b>Gemelos .md/llms</b>: ${twinsTotal}`,
    `<b>Origen</b>: ${origin.total} peticiones · ${t404}× 404 · ${t418}× tarpit (${origin.tarpitIps.size} IPs)`,
    "",
    `<b>Top páginas (edge)</b>`,
    ...edge.topPages
      .slice(0, 5)
      .map((r) => `  ${r.n}× <code>${esc(r.p)}</code>`),
  ];
  const top404 = rows(origin.top404, 3);
  if (top404.length > 0) {
    lines.push(
      "",
      "<b>404 más repetidos</b>",
      ...top404.map(([p, n]) => `  ${n}× <code>${esc(p)}</code>`),
    );
  }
  lines.push("", "El detalle completo va en el HTML adjunto.");
  return lines.join("\n");
}

/** The full self-contained HTML report (site palette, dark). */
function buildHtml(edge, origin, date) {
  const table = (title, entries, cols) => `
    <section><h2>${esc(title)}</h2><table><thead><tr>${cols
      .map((c) => `<th>${esc(c)}</th>`)
      .join("")}</tr></thead><tbody>${entries
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></section>`;
  const classRows = {};
  for (const r of edge.classes) {
    classRows[r.c] ??= { bot: 0, browser: 0, "empty-ua": 0 };
    classRows[r.c][r.ua] = (classRows[r.c][r.ua] ?? 0) + r.n;
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>jmrp.io tráfico ${esc(date)}</title>
<style>
  body { margin: 0 auto; max-width: 900px; padding: 24px 16px; background: #0a0a0b;
         color: #b6b5ae; font: 15px/1.5 system-ui, sans-serif; }
  h1 { color: #f4f2ec; font-size: 22px; } h1 span { color: #f5a623; }
  h2 { color: #f5a623; font-size: 15px; margin: 28px 0 8px;
       text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; color: #8c8a82; font-weight: 600; padding: 4px 8px;
       border-bottom: 1px solid #26262c; }
  td { padding: 4px 8px; border-bottom: 1px solid #1a1a1e;
       font-family: ui-monospace, monospace; overflow-wrap: anywhere; }
  td:last-child, th:last-child { text-align: right; }
  p.meta { color: #8c8a82; font-size: 13px; }
</style></head><body>
<h1><span>jmrp.io</span> · tráfico diario — ${esc(date)}</h1>
<p class="meta">Últimas 24 h. Edge = registro del worker (todo el tráfico);
origen = nginx (lo que atraviesa la caché). Excluido loopback y las IPs
propias del mapa DDNS.</p>
${table(
  "Edge · por clase",
  Object.entries(classRows).map(([c, v]) => [
    c,
    v.browser ?? 0,
    v.bot ?? 0,
    (v.browser ?? 0) + (v.bot ?? 0) + (v["empty-ua"] ?? 0),
  ]),
  ["clase", "navegador", "bot", "total"],
)}
${table(
  "Edge · top páginas",
  edge.topPages.map((r) => [r.p, r.n]),
  ["ruta", "peticiones"],
)}
${table(
  "Edge · gemelos .md y llms.txt",
  edge.twins.map((r) => [r.p, r.ua, r.n]),
  ["ruta", "cliente", "n"],
)}
${table(
  "Edge · países",
  edge.countries.map((r) => [r.cc || "?", r.n]),
  ["país", "n"],
)}
${table(
  "Origen · estados",
  [...origin.byStatus.entries()].sort((a, b) => b[1] - a[1]),
  ["estado", "n"],
)}
${table("Origen · top páginas 200", rows(origin.topPages, 15), ["ruta", "n"])}
${table("Origen · 404 (candidatos a redirect)", rows(origin.top404, 20), ["ruta", "n"])}
${table("Origen · tarpit (418)", rows(origin.tarpit, 15), ["ruta", "n"])}
${table("Origen · 405 (sondas POST)", rows(origin.top405, 10), ["petición", "n"])}
${table("Origen · user agents", rows(origin.uas, 15), ["ua", "n"])}
<p class="meta">Generado por scripts/traffic-report.mjs · timer systemd 22:00 Europe/Madrid</p>
</body></html>`;
}

/* cspell:enable */

// ── Telegram ────────────────────────────────────────────────────────────────

/** Sends the summary message. */
async function sendMessage(text) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  if (!res.ok)
    throw new Error(`sendMessage ${res.status}: ${await res.text()}`);
}

/** Attaches the HTML report as a document. */
async function sendDocument(filename, html) {
  const form = new FormData();
  form.set("chat_id", TELEGRAM_CHAT_ID);
  form.set("document", new Blob([html], { type: "text/html" }), filename);
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method: "POST", body: form },
  );
  if (!res.ok)
    throw new Error(`sendDocument ${res.status}: ${await res.text()}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const sinceMs = now.getTime() - 24 * 3600 * 1000;

  let edge = { classes: [], topPages: [], twins: [], countries: [] };
  try {
    edge = await collectEdge();
  } catch (error) {
    console.error(`[traffic-report] edge collection failed: ${error.message}`);
  }
  const origin = collectOrigin(sinceMs);

  const message = buildMessage(edge, origin, date);
  const html = buildHtml(edge, origin, date);

  if (DRY_RUN) {
    console.log(message);
    const out = path.join(os.tmpdir(), `traffic-${date}.html`);
    fs.writeFileSync(out, html);
    console.log(`[dry-run] HTML: ${out}`);
    return;
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing");
  }
  await sendMessage(message);
  await sendDocument(`jmrp-traffic-${date}.html`, html);
  console.log(`[traffic-report] sent for ${date}`);
}

await main();
