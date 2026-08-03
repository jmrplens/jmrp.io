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
}

/**
 * The token registry. Keys are grouped by the component that renders them.
 * Every literal MUST be unique and match `^HLM_[A-Z0-9_]+$`.
 */
export const HLM = {
  /** KPI band (HomelabKpi). */
  kpi: {
    /** Services currently online (numerator; the denominator is static). */
    online: "HLM_ONLINE",
    /** HTTP requests received in the last 24 h. */
    requests: "HLM_REQ_24H",
    /** WAN download traffic in the last 24 h. */
    wan: "HLM_WAN_24H",
  },

  /** Edge-defense spotlight (InfrastructureInsights). */
  edge: {
    /** Aggregate threats blocked in 24 h (tarpit + nginx bans). */
    threats: "HLM_THREATS_24H",
    /** MikroTik honeypot hits. */
    honeypot: "HLM_HONEYPOT_HITS",
    /** Nginx tarpit hits, 24 h. */
    tarpit: "HLM_TARPIT_HITS",
    /** Nginx bans, 24 h. */
    nginxBans: "HLM_NGINX_BANS",
    /** CrowdSec blocked IPs (router blocklist size). */
    crowdsec: "HLM_CROWDSEC_BLOCKED",
    /** Blacklisted port scanners on the router. */
    blacklist: "HLM_BLACKLIST_SCANNERS",
    /** Router WAN download bytes, formatted. */
    wanRx: "HLM_WAN_RX",
    /** Active connections tracked by the router. */
    activeConnections: "HLM_ACTIVE_CONNECTIONS",
    /** Requests received, 24 h (same figure as the KPI band). */
    requests: "HLM_REQ_24H",
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
    },
    matrix: {
      cpu: "HLM_NODE_MATRIX_CPU",
      mem: "HLM_NODE_MATRIX_RAM",
      temp: "HLM_NODE_MATRIX_TEMP",
      status: "HLM_NODE_MATRIX_STATUS",
      tempLabel: "HLM_NODE_MATRIX_TEMP_LABEL",
      cpuBar: "HLM_NODE_MATRIX_CPU_BAR",
      memBar: "HLM_NODE_MATRIX_RAM_BAR",
    },
    mastodon: {
      cpu: "HLM_NODE_MASTODON_CPU",
      mem: "HLM_NODE_MASTODON_RAM",
      temp: "HLM_NODE_MASTODON_TEMP",
      status: "HLM_NODE_MASTODON_STATUS",
      tempLabel: "HLM_NODE_MASTODON_TEMP_LABEL",
      cpuBar: "HLM_NODE_MASTODON_CPU_BAR",
      memBar: "HLM_NODE_MASTODON_RAM_BAR",
    },
    truenas: {
      cpu: "HLM_NODE_TRUENAS_CPU",
      mem: "HLM_NODE_TRUENAS_RAM",
      temp: "HLM_NODE_TRUENAS_TEMP",
      status: "HLM_NODE_TRUENAS_STATUS",
      tempLabel: "HLM_NODE_TRUENAS_TEMP_LABEL",
      cpuBar: "HLM_NODE_TRUENAS_CPU_BAR",
      memBar: "HLM_NODE_TRUENAS_RAM_BAR",
    },
    mikrotik: {
      cpu: "HLM_NODE_MIKROTIK_CPU",
      mem: "HLM_NODE_MIKROTIK_RAM",
      temp: "HLM_NODE_MIKROTIK_TEMP",
      status: "HLM_NODE_MIKROTIK_STATUS",
      tempLabel: "HLM_NODE_MIKROTIK_TEMP_LABEL",
      cpuBar: "HLM_NODE_MIKROTIK_CPU_BAR",
      memBar: "HLM_NODE_MIKROTIK_RAM_BAR",
    },
  } satisfies Record<string, NodeSsr>,

  /** UTC time the injected values were captured (e.g. "18:42 UTC"). */
  asOf: "HLM_AS_OF",
} as const;
