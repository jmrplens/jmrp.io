import { useEffect, useRef, useState } from "preact/hooks";

/** Translations required by InfrastructureInsights. Passed from Astro parent. */
export interface InfrastructureTranslations {
  /** ARIA label for the infrastructure insights container. */
  ariaLabel: string;
  /** Error message shown when data fetching fails. */
  error: string;
  /** Heading for the requests received metric. */
  requestsReceived: string;
  /** Screen-reader-only label for the requests received value. */
  requestsReceivedSR: string;
  /** Label indicating how many requests were handled. */
  handled: string;
  /** Heading for the responses sent metric. */
  responsesSent: string;
  /** Label for upstream proxy responses. */
  upstream: string;
  /** Prefix text before the upload bandwidth value. */
  sentPrefix: string;
  /** Label for the upload bandwidth metric. */
  bandwidthUp: string;
  /** Prefix text before the download bandwidth value. */
  receivedPrefix: string;
  /** Label for the download bandwidth metric. */
  bandwidthDown: string;
  /** Heading for the security blocks section. */
  securityBlocks: string;
  /** Text shown while data is loading. */
  loading: string;
  /** Shown in place of a value when it is unavailable (e.g. API failed). */
  noData: string;
  /** Label for the total security blocks count. */
  totalSecurityBlocks: string;
  /** Unit label for block counts. */
  blocks: string;
  /** Label for the Nginx ban count. */
  nginxBans: string;
  /**
   * Extra descriptive text composed after the visible link text to build an
   * `aria-label` for the tarpit blog post link (WCAG 2.5.3 Label in Name:
   * the visible text must remain the start of the accessible name).
   */
  tarpitBlogAria: string;
  /** URL of the tarpit blog post. */
  tarpitBlogUrl: string;
  /** Label for the tarpit hits metric. */
  tarpitHits: string;
  /** Unit label for tarpit hit counts. */
  tarpitHitsUnit: string;
  /**
   * Extra descriptive text composed after the visible link text to build an
   * `aria-label` for the port scanner honeypot blog post link (WCAG 2.5.3
   * Label in Name: the visible text must remain the start of the accessible
   * name).
   */
  portScannerBlogAria: string;
  /** URL of the port scanner blog post. */
  portScannerBlogUrl: string;
  /** Heading for the attack regions section. */
  attackRegions: string;
  /** ARIA label for the attack regions list. */
  attackRegionsList: string;
  /** Text shown when no attack regions are detected. */
  noAttackRegions: string;
  /** Unit label for hit counts in attack regions. */
  hits: string;
  /** Label for the rate-limited requests metric. */
  rateLimits: string;
  /** Heading for the system status section. */
  systemStatus: string;
  /** Heading for the node resource load subsection. */
  nodeResourceLoad: string;
  /** Prefix text before the CPU usage value. */
  cpuUsagePrefix: string;
  /** Unit label for CPU percentage. */
  percentCPU: string;
  /** Label for the memory usage metric. */
  memoryUsage: string;
  /** Unit label for RAM percentage. */
  percentRAM: string;
  /** Heading for the load status indicator. */
  loadStatus: string;
  /** Status text when load is critical. */
  statusCritical: string;
  /** Status text when load is high. */
  statusHigh: string;
  /** Status text when load is elevated. */
  statusElevated: string;
  /** Status text when load is optimal. */
  statusOptimal: string;
  /** Status text when load is healthy. */
  statusHealthy: string;
  /** Status text when load status cannot be determined. */
  statusUnknown: string;
  /** Label for CPU temperature. */
  cpuTemp: string;
  /** Kicker for the edge-defense spotlight (rendered as a mono `// ` label). */
  edgeDefense: string;
  /** Chip beside the edge-defense kicker (e.g. "router + nginx"). */
  edgeDefenseChip: string;
  /** Label under the hero aggregate number (e.g. "threats blocked · 24h"). */
  threatsBlocked: string;
  /** Prose describing how the WAF/honeypot pipeline decides what to block. */
  edgeDescription: string;
  /** "Learn more" link label pointing to the tarpit write-up. */
  linkTarpit: string;
  /** "Learn more" link label pointing to the honeypot/CrowdSec write-up. */
  linkHoneypot: string;
  /** One-line description of the defense data flow. */
  flowBand: string;
  /** Title of the MikroTik (network-layer) column. */
  mikrotikTitle: string;
  /** Sub-label for the MikroTik column (e.g. "network layer · honeypot"). */
  mikrotikLayer: string;
  /** Title of the CrowdSec + NGINX (application-layer) column. */
  crowdsecTitle: string;
  /** Sub-label for the CrowdSec column (e.g. "application layer · WAF"). */
  crowdsecLayer: string;
  /** Label for the honeypot hits metric. */
  honeypotHits: string;
  /** Label for the blacklisted scanners metric. */
  blacklistScanners: string;
  /** Label for the active connections metric. */
  activeConnections: string;
  /** Label for the WAN 24h traffic metric. */
  wanTraffic: string;
  /** Label for the CrowdSec blocked-IPs metric. */
  crowdsecBlocked: string;
}

/** Component props */
interface Props {
  readonly translations: InfrastructureTranslations;
}

interface Country {
  code: string;
  count: number;
}

interface HomelabStats {
  requests_received_24h: number;
  responses_sent_24h: number;
  upstream_sent_24h: number;
  bandwidth_sent_24h: number;
  bandwidth_recv_24h: number;
  tarpit_hits_24h: number;
  nginx_bans_24h: number;
  mikrotik_scans_total: number;
  rate_limited_503_24h: number;
  cpu_usage_avg: number;
  mem_used_percent: number;
  cpu_temp: number | null;
  top_security_countries: Country[];
}

/** MikroTik edge-router stats (network layer + honeypot) for the spotlight. */
interface MikrotikStats {
  honeypot_hits: number;
  port_scanners_dropped: number;
  blacklist_scanners: number;
  crowdsec_blocked: number;
  active_connections: number;
  wan_rx_bytes: number;
  wan_tx_bytes: number;
}

/** Light validation for the MikroTik payload (spotlight is best-effort). */
function isValidMikrotik(data: unknown): data is MikrotikStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.honeypot_hits === "number" &&
    typeof d.crowdsec_blocked === "number"
  );
}

/**
 * Validates the HomelabStats object.
 */
function isValidHomelabStats(data: unknown): data is HomelabStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const requiredNumericFields = [
    "requests_received_24h",
    "responses_sent_24h",
    "upstream_sent_24h",
    "bandwidth_sent_24h",
    "bandwidth_recv_24h",
    "tarpit_hits_24h",
    "nginx_bans_24h",
    "mikrotik_scans_total",
    "rate_limited_503_24h",
    "cpu_usage_avg",
    "mem_used_percent",
  ];

  return (
    requiredNumericFields.every((field) => typeof d[field] === "number") &&
    (typeof d.cpu_temp === "number" || d.cpu_temp === null) &&
    Array.isArray(d.top_security_countries) &&
    d.top_security_countries.every(
      (c: unknown) =>
        c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).code === "string" &&
        typeof (c as Record<string, unknown>).count === "number",
    )
  );
}

/**
 * Formats bytes to a human-readable string.
 * @param bytes - The number of bytes.
 */
function formatBytes(bytes: number | string) {
  const numBytes = typeof bytes === "string" ? Number.parseFloat(bytes) : bytes;
  if (!Number.isFinite(numBytes) || numBytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  const clampedI = Math.max(0, Math.min(i, sizes.length - 1));
  return `${Number.parseFloat((numBytes / Math.pow(k, clampedI)).toFixed(2))} ${sizes[clampedI]}`;
}

/**
 * Infrastructure insights component.
 * Displays real-time statistics from Nginx and InfluxDB.
 *
 * @param props - Component properties including translations.
 */
export default function InfrastructureInsights({ translations: t }: Props) {
  const [stats, setStats] = useState<HomelabStats | null>(null);
  const [mikrotik, setMikrotik] = useState<MikrotikStats | null>(null);
  const [error, setError] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // Refresh interval in milliseconds (30 seconds)
    const REFRESH_INTERVAL = 30_000;

    const fetchMikrotik = async (headers: Record<string, string>) => {
      try {
        const mkRes = await fetch("/api/homelab/mikrotik", {
          signal: controller.signal,
          headers,
        });
        if (mkRes.ok) {
          const mkData = (await mkRes.json()) as unknown;
          if (isValidMikrotik(mkData)) setMikrotik(mkData);
        }
      } catch (mkError: unknown) {
        if (!(
          mkError instanceof DOMException && mkError.name === "AbortError"
        )) {
          console.error("Failed to fetch MikroTik stats", mkError);
        }
      }
    };

    const fetchStats = async () => {
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const headers = { "X-Homelab-Token": token };
        const res = await fetch("/api/homelab/stats", {
          signal: controller.signal,
          headers,
        });
        if (res.ok) {
          const data = (await res.json()) as unknown;
          if (isValidHomelabStats(data)) {
            setStats(data);
            setError(false);
          } else {
            console.error("Malformed infrastructure stats received", data);
            setError(true);
          }
        } else {
          setError(true);
        }

        // MikroTik edge-router data feeds the network-layer spotlight column
        // (best-effort; a failure never blocks the main stats view).
        await fetchMikrotik(headers);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch infrastructure stats", error);
        setError(true);
      } finally {
        isFetchingRef.current = false;
      }
    };

    // Initial fetch
    void fetchStats();

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      void fetchStats();
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  const displayVal = (
    val: number | null | undefined,
    formatter?: (v: number | string) => string,
  ) => {
    if (val === undefined || val === null) return t.noData;
    return formatter ? formatter(val) : val.toLocaleString();
  };

  const countries = stats?.top_security_countries || [];

  // Aggregate headline: same honest 24h sum as the KPI band (tarpit + nginx).
  const threats24h =
    stats == null ? null : stats.tarpit_hits_24h + stats.nginx_bans_24h;

  // Four headline sub-metrics shown in the hero band (all distinct real fields).
  const fwTop = [
    { label: t.honeypotHits, value: displayVal(mikrotik?.honeypot_hits) },
    { label: t.tarpitHits, value: displayVal(stats?.tarpit_hits_24h) },
    { label: t.nginxBans, value: displayVal(stats?.nginx_bans_24h) },
    { label: t.crowdsecBlocked, value: displayVal(mikrotik?.crowdsec_blocked) },
  ];

  if (error) {
    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="stats-error">{t.error}</div>
      </section>
    );
  }

  return (
    <section
      className="infrastructure-section edge-defense"
      aria-label={t.ariaLabel}
    >
      <div className="edge-defense__head">
        <p className="section-title">{t.edgeDefense}</p>
        <span className="edge-defense__chip">{t.edgeDefenseChip}</span>
      </div>

      <div className="edge-card">
        <div className="edge-hero">
          <span
            className="i-mdi:shield-check-outline edge-hero__icon"
            aria-hidden="true"
          />
          <div className="edge-hero__lead">
            <div className="edge-hero__headline">
              <output className="edge-hero__num">
                {displayVal(threats24h)}
              </output>
              <span className="edge-hero__label">{t.threatsBlocked}</span>
            </div>
            <p className="edge-hero__desc">{t.edgeDescription}</p>
          </div>
          <div className="edge-hero__metrics">
            {fwTop.map((m) => (
              <div
                className="edge-metric"
                key={m.label}
              >
                <span className="edge-metric__num">{m.value}</span>
                <span className="edge-metric__label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="edge-flow">{t.flowBand}</p>

        <div className="edge-cols">
          {/* Network layer — MikroTik + honeypot */}
          <article
            className="edge-col"
            aria-labelledby="edge-mikrotik-title"
          >
            <header className="edge-col__head">
              <span
                className="i-simple-icons:mikrotik edge-col__icon"
                aria-hidden="true"
              />
              <span className="edge-col__heading">
                <span
                  className="edge-col__title"
                  id="edge-mikrotik-title"
                >
                  {t.mikrotikTitle}
                </span>
                <span className="edge-col__sub">{t.mikrotikLayer}</span>
              </span>
            </header>
            <dl className="edge-rows">
              {/* port_scanners_dropped === honeypot_hits (same backend counter).
                  "Honeypot hits" is already in the hero band above; the redundant
                  "Port Scanners" row has been removed per §E. */}
              <div className="edge-row">
                <dt>{t.blacklistScanners}</dt>
                <dd>{displayVal(mikrotik?.blacklist_scanners)}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.wanTraffic}</dt>
                <dd>
                  {mikrotik ? `${formatBytes(mikrotik.wan_rx_bytes)} ↓` : "..."}
                </dd>
              </div>
              <div className="edge-row">
                <dt>{t.activeConnections}</dt>
                <dd>{displayVal(mikrotik?.active_connections)}</dd>
              </div>
            </dl>
          </article>

          {/* Application layer — CrowdSec WAF + NGINX */}
          <article
            className="edge-col"
            aria-labelledby="edge-crowdsec-title"
          >
            <header className="edge-col__head">
              <span
                className="i-mdi:shield-outline edge-col__icon"
                aria-hidden="true"
              />
              <span className="edge-col__heading">
                <span
                  className="edge-col__title"
                  id="edge-crowdsec-title"
                >
                  {t.crowdsecTitle}
                </span>
                <span className="edge-col__sub">{t.crowdsecLayer}</span>
              </span>
            </header>
            <dl className="edge-rows">
              <div className="edge-row">
                <dt>{t.crowdsecBlocked}</dt>
                <dd>{displayVal(mikrotik?.crowdsec_blocked)}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.requestsReceived}</dt>
                <dd>{displayVal(stats?.requests_received_24h)}</dd>
              </div>
              <div className="edge-row">
                <dt>
                  <a
                    href={t.tarpitBlogUrl}
                    className="insight-link"
                    aria-label={`${t.tarpitHits} — ${t.tarpitBlogAria}`}
                  >
                    {t.tarpitHits}
                  </a>
                </dt>
                <dd>{displayVal(stats?.tarpit_hits_24h)}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.nginxBans}</dt>
                <dd>{displayVal(stats?.nginx_bans_24h)}</dd>
              </div>
            </dl>
            {countries.length > 0 && (
              <div className="edge-regions">
                <span className="edge-regions__label">{t.attackRegions}</span>
                <ul
                  className="country-list"
                  aria-label={t.attackRegionsList}
                >
                  {countries.map((c) => (
                    <li
                      key={c.code}
                      className="country-badge"
                      aria-label={`${c.code} — ${c.count} ${t.hits}`}
                      title={`${c.count} ${t.hits}`}
                    >
                      {c.code}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        </div>
      </div>

      <div className="edge-links">
        <a
          href={t.tarpitBlogUrl}
          className="edge-link"
          aria-label={`${t.linkTarpit} — ${t.tarpitBlogAria}`}
        >
          {t.linkTarpit}
        </a>
        <a
          href={t.portScannerBlogUrl}
          className="edge-link"
          aria-label={`${t.linkHoneypot} — ${t.portScannerBlogAria}`}
        >
          {t.linkHoneypot}
        </a>
      </div>
    </section>
  );
}
