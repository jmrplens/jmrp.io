/**
 * SSR metric tokens — the contract between this repo and nginx.
 *
 * ── How the homelab metrics work (no client-side JavaScript) ────────────────
 *
 * The homelab components render these placeholder strings into the static
 * HTML at build time. At serve time, nginx replaces every `HLM_*` token with
 * a fresh, locale-formatted value before the response leaves the server
 * (`body_filter_by_lua` on the `/homelab/` + `/es/homelab/` location), so
 * crawlers and readers without JavaScript receive real numbers — at most a
 * few minutes old — instead of dashes.
 *
 * The nginx side lives in `/etc/nginx/lua/homelab_ssr_metrics.lua`, which
 * holds the MIRROR of this registry: for every token declared here, that file
 * declares where the value comes from (which `127.0.0.1:8999/stats/*`
 * endpoint and field) and how to format it. Any token nginx does not
 * recognize is replaced with an em dash ("—"), so an out-of-sync registry
 * degrades to the page's historical no-data state, never to a leaked
 * placeholder.
 *
 * ── Adding, renaming or removing a metric ───────────────────────────────────
 *
 * 1. Add/rename/remove the token HERE (keep the `HLM_` prefix — the lua side
 *    replaces the pattern `HLM_[A-Z0-9_]+`, and the prefix is what keeps the
 *    substitution from ever touching legitimate page copy).
 * 2. Mirror the change in the `METRICS` table of
 *    `/etc/nginx/lua/homelab_ssr_metrics.lua`, then `nginx -s reload`.
 * 3. Render the token from the component (usually via the `ssr` prop wired in
 *    `HomelabPage.astro`).
 * 4. Rebuild the site. In `astro preview` (no nginx) the raw token is visible
 *    on the page — that is expected; only nginx performs the substitution.
 *
 * Values are PRE-FORMATTED by lua per locale (thousands separators, byte
 * units, "%"/"°C" suffixes), so components must render them verbatim and
 * never re-format them.
 */

/** One Tor node's injected figures. */
export interface TorNodeSsr {
  /** Headline count: clients (bridges) or connections (relays), 24 h. */
  readonly headline: string;
  /** Human-readable node location (comes from the Tor API). */
  readonly location: string;
  /** Advertised bandwidth, formatted (e.g. "17.6 MB/s"). */
  readonly bandwidth: string;
}

/** One infrastructure node's injected figures. */
export interface NodeSsr {
  /** CPU usage, formatted percentage (e.g. "6.4%"). */
  readonly cpu: string;
  /** RAM usage, formatted percentage. */
  readonly mem: string;
  /** CPU temperature, formatted (e.g. "44°C"). */
  readonly temp: string;
  /** Localized status-pill text ("Optimal" / "High load"), threshold-aware. */
  readonly status: string;
  /** Localized temperature label, threshold-aware. */
  readonly tempLabel: string;
  /**
   * CSS class(es) driving the CPU meter fill width, e.g. "hlm-w35" — stepped
   * to 5% and suffixed with the warn modifier past the high-load threshold.
   * A class is used because the page CSP blocks inline `style` attributes;
   * the `.hlm-w*` rules live in homelab-components.css.
   */
  readonly cpuBar: string;
  /** Same as `cpuBar`, for the RAM meter. */
  readonly memBar: string;
  /**
   * Full CSS class for the status pill ("node-card__status--ok" or
   * "node-card__status--warn"), injected by nginx because the SSR component
   * cannot branch on serve-time values — at build time these props hold the
   * raw tokens, not numbers.
   */
  readonly statusClass: string;
  /** Icon class for the pill: "node-card__dot" or "i-mdi:alert-outline". */
  readonly statusIcon: string;
}

/**
 * The token registry. Keys are grouped by the component that renders them.
 * Every literal MUST match `^HLM_[A-Z0-9_]+$` and be unique PER METRIC — one
 * metric rendered in several places shares one literal, and two different
 * metrics must never share one.
 */
export const HLM = {
  /** KPI band (HomelabKpi). */
  kpi: {
    /** Services currently online (numerator; the denominator is static). */
    online: "HLM_ONLINE",
    /**
     * Connections the router is tracking right now. It replaced the monitored
     * node count, a build-time constant the page already states beside it.
     */
    activeConnections: "HLM_ACTIVE_CONNECTIONS",
    /** HTTP requests received in the last 24 h, origin and edge together. */
    requests: "HLM_REQ_24H",
    /** WAN download traffic in the last 24 h. */
    wan: "HLM_WAN_24H",
    /** WAN upload over the same window, rendered beside the download. */
    wanUp: "HLM_WAN_TX_24H",
  },

  /**
   * Edge-defense spotlight (InfrastructureInsights).
   *
   * Every figure here answers "what was stopped". Throughput belongs to the KPI
   * band: WAN traffic, active connections and total requests used to sit in
   * these two columns, where they read as part of the defence.
   */
  edge: {
    /** Blocked in 24 h: tarpit hits + nginx refusals + honeypot hits. */
    threats: "HLM_THREATS_24H",
    /** MikroTik honeypot hits, 24 h. */
    honeypot: "HLM_HONEYPOT_HITS",
    /** Nginx tarpit hits, 24 h. */
    tarpit: "HLM_TARPIT_HITS",
    /** Requests the nginx bouncer refused, 24 h. */
    nginxBans: "HLM_NGINX_BANS",
    /** Distinct IPs behind those refusals, 24 h. */
    banIps: "HLM_NGINX_BAN_IPS",
    /**
     * Size of the CrowdSec address list the router enforces. It reads as a
     * router figure, so it sits in the MikroTik column; the hero band above
     * still carries it as one of the four headline numbers.
     */
    crowdsec: "HLM_CROWDSEC_BLOCKED",
    /** Blacklisted port scanners on the router. */
    blacklist: "HLM_BLACKLIST_SCANNERS",
    /**
     * Packets the router dropped in 24 h because the source was on the
     * CrowdSec address list. This is the layer before nginx: those packets
     * never reached it, so no other figure on the page counts them.
     */
    routerDrops: "HLM_ROUTER_DROPS",
  },

  /**
   * Where the blocked traffic came from, one list per layer: the four busiest
   * country codes of the last 24 h with their counts. Two lists, because the
   * columns stop different things — the router drops packets from its
   * blocklist, nginx tarpits and refuses requests — and a single shared list
   * would file the tarpit's countries under the router's heading.
   *
   * A list of variable length cannot be a token, so the four slots are fixed
   * and a slot the server has no country for resolves to an em dash, which the
   * component reads as "unused" and skips.
   */
  origins: {
    /** GeoIP of the sources the router dropped (`router_drops`). */
    router: [
      { code: "HLM_ROUTER_CC1", count: "HLM_ROUTER_N1" },
      { code: "HLM_ROUTER_CC2", count: "HLM_ROUTER_N2" },
      { code: "HLM_ROUTER_CC3", count: "HLM_ROUTER_N3" },
      { code: "HLM_ROUTER_CC4", count: "HLM_ROUTER_N4" },
    ],
    /** GeoIP of the clients the tarpit caught (`nginx_tarpit`). */
    nginx: [
      { code: "HLM_ATTACK_CC1", count: "HLM_ATTACK_N1" },
      { code: "HLM_ATTACK_CC2", count: "HLM_ATTACK_N2" },
      { code: "HLM_ATTACK_CC3", count: "HLM_ATTACK_N3" },
      { code: "HLM_ATTACK_CC4", count: "HLM_ATTACK_N4" },
    ],
  },

  /** Per-service stat pairs (ServiceStats). */
  services: {
    mastodon: {
      primary: "HLM_MASTODON_PEERS",
      secondary: "HLM_MASTODON_VERSION",
    },
    matrix: { primary: "HLM_MATRIX_FED", secondary: "HLM_SYNAPSE_VERSION" },
    pds: { primary: "HLM_PDS_RECORDS", secondary: "HLM_PDS_VERSION" },
  },

  /**
   * Per-service status pill (ServiceCard), keyed by the `services` array ids
   * in HomelabPage.astro — one entry per `probed: true` card, sourced from
   * the same `/stats/health` probe that feeds `kpi.online`, so the pill can
   * never contradict the KPI.
   */
  serviceStatus: {
    mastodon: {
      /** Localized pill word ("Online"/"Offline"), live from the probe. */
      status: "HLM_SVC_MASTODON_STATUS",
      /** Pill state class: "is-online" or "is-offline" (styled in ServiceCard). */
      statusClass: "HLM_SVC_MASTODON_STATUS_CLASS",
    },
    matrix: {
      status: "HLM_SVC_MATRIX_STATUS",
      statusClass: "HLM_SVC_MATRIX_STATUS_CLASS",
    },
    pds: {
      status: "HLM_SVC_PDS_STATUS",
      statusClass: "HLM_SVC_PDS_STATUS_CLASS",
    },
    mcp: {
      status: "HLM_SVC_MCP_STATUS",
      statusClass: "HLM_SVC_MCP_STATUS_CLASS",
    },
  } satisfies Record<string, { status: string; statusClass: string }>,

  /**
   * MCP fleet rows on the MCP service card: one row per server, with the
   * running version, the alive-replica count ("3/3") and a dot class in the
   * pill vocabulary (`is-online` / `is-degraded` / `is-offline`). Values come
   * from `/stats/mcp` (homelab_mcp.lua), which probes every replica's
   * `/health` on loopback.
   */
  mcpFleet: {
    gitlab: {
      version: "HLM_MCP_GITLAB_VERSION",
      alive: "HLM_MCP_GITLAB_ALIVE",
      dotClass: "HLM_MCP_GITLAB_CLASS",
    },
    libgen: {
      version: "HLM_MCP_LIBGEN_VERSION",
      alive: "HLM_MCP_LIBGEN_ALIVE",
      dotClass: "HLM_MCP_LIBGEN_CLASS",
    },
  } satisfies Record<
    string,
    { version: string; alive: string; dotClass: string }
  >,

  /** Tor aggregate band (TorAggregate). */
  torAggregate: {
    /** Clients helped across all nodes, 24 h. */
    clients: "HLM_TOR_CLIENTS_24H",
    /** Total advertised bandwidth (already includes "/s"). */
    bandwidth: "HLM_TOR_BANDWIDTH",
    /** Total relayed traffic, 24 h. */
    traffic: "HLM_TOR_TRAFFIC_24H",
  },

  /** Per-node Tor cards (TorStats), keyed by `torType`. */
  torNodes: {
    bridge: {
      headline: "HLM_TOR_BRIDGE_HEAD",
      location: "HLM_TOR_BRIDGE_LOC",
      bandwidth: "HLM_TOR_BRIDGE_BW",
    },
    "bridge-es1": {
      headline: "HLM_TOR_BRIDGE_ES1_HEAD",
      location: "HLM_TOR_BRIDGE_ES1_LOC",
      bandwidth: "HLM_TOR_BRIDGE_ES1_BW",
    },
    relay: {
      headline: "HLM_TOR_RELAY_HEAD",
      location: "HLM_TOR_RELAY_LOC",
      bandwidth: "HLM_TOR_RELAY_BW",
    },
    "relay-es": {
      headline: "HLM_TOR_RELAY_ES_HEAD",
      location: "HLM_TOR_RELAY_ES_LOC",
      bandwidth: "HLM_TOR_RELAY_ES_BW",
    },
  } satisfies Record<string, TorNodeSsr>,

  /** Infrastructure node grid (NodeCards), keyed by node `key`. */
  nodes: {
    nginx: {
      cpu: "HLM_NODE_NGINX_CPU",
      mem: "HLM_NODE_NGINX_RAM",
      temp: "HLM_NODE_NGINX_TEMP",
      status: "HLM_NODE_NGINX_STATUS",
      tempLabel: "HLM_NODE_NGINX_TEMP_LABEL",
      cpuBar: "HLM_NODE_NGINX_CPU_BAR",
      memBar: "HLM_NODE_NGINX_RAM_BAR",
      statusClass: "HLM_NODE_NGINX_STATUS_CLASS",
      statusIcon: "HLM_NODE_NGINX_STATUS_ICON",
    },
    matrix: {
      cpu: "HLM_NODE_MATRIX_CPU",
      mem: "HLM_NODE_MATRIX_RAM",
      temp: "HLM_NODE_MATRIX_TEMP",
      status: "HLM_NODE_MATRIX_STATUS",
      tempLabel: "HLM_NODE_MATRIX_TEMP_LABEL",
      cpuBar: "HLM_NODE_MATRIX_CPU_BAR",
      memBar: "HLM_NODE_MATRIX_RAM_BAR",
      statusClass: "HLM_NODE_MATRIX_STATUS_CLASS",
      statusIcon: "HLM_NODE_MATRIX_STATUS_ICON",
    },
    mastodon: {
      cpu: "HLM_NODE_MASTODON_CPU",
      mem: "HLM_NODE_MASTODON_RAM",
      temp: "HLM_NODE_MASTODON_TEMP",
      status: "HLM_NODE_MASTODON_STATUS",
      tempLabel: "HLM_NODE_MASTODON_TEMP_LABEL",
      cpuBar: "HLM_NODE_MASTODON_CPU_BAR",
      memBar: "HLM_NODE_MASTODON_RAM_BAR",
      statusClass: "HLM_NODE_MASTODON_STATUS_CLASS",
      statusIcon: "HLM_NODE_MASTODON_STATUS_ICON",
    },
    truenas: {
      cpu: "HLM_NODE_TRUENAS_CPU",
      mem: "HLM_NODE_TRUENAS_RAM",
      temp: "HLM_NODE_TRUENAS_TEMP",
      status: "HLM_NODE_TRUENAS_STATUS",
      tempLabel: "HLM_NODE_TRUENAS_TEMP_LABEL",
      cpuBar: "HLM_NODE_TRUENAS_CPU_BAR",
      memBar: "HLM_NODE_TRUENAS_RAM_BAR",
      statusClass: "HLM_NODE_TRUENAS_STATUS_CLASS",
      statusIcon: "HLM_NODE_TRUENAS_STATUS_ICON",
    },
    mikrotik: {
      cpu: "HLM_NODE_MIKROTIK_CPU",
      mem: "HLM_NODE_MIKROTIK_RAM",
      temp: "HLM_NODE_MIKROTIK_TEMP",
      status: "HLM_NODE_MIKROTIK_STATUS",
      tempLabel: "HLM_NODE_MIKROTIK_TEMP_LABEL",
      cpuBar: "HLM_NODE_MIKROTIK_CPU_BAR",
      memBar: "HLM_NODE_MIKROTIK_RAM_BAR",
      statusClass: "HLM_NODE_MIKROTIK_STATUS_CLASS",
      statusIcon: "HLM_NODE_MIKROTIK_STATUS_ICON",
    },
  } satisfies Record<string, NodeSsr>,

  /**
   * Local time the injected values were captured, with its UTC offset
   * (e.g. "18:42 UTC+2"). Europe/Madrid, like every other date on the site.
   *
   * An offset rather than `CEST`/`CET`: it needs no knowledge of European
   * zone names, and it is the notation the rest of the site already uses.
   * nginx derives BOTH the time and the offset from the same timestamp
   * against the host's `/etc/localtime`, so the two cannot disagree, and
   * summer time needs no handling — the offset just reads +2 instead of +1.
   */
  asOf: "HLM_AS_OF",
} as const;
