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
  /** Label for the total security blocks count. */
  totalSecurityBlocks: string;
  /** Unit label for block counts. */
  blocks: string;
  /** Label for the Nginx ban count. */
  nginxBans: string;
  /** ARIA label for the link to the tarpit blog post. */
  tarpitBlogAria: string;
  /** URL of the tarpit blog post. */
  tarpitBlogUrl: string;
  /** Label for the tarpit hits metric. */
  tarpitHits: string;
  /** Unit label for tarpit hit counts. */
  tarpitHitsUnit: string;
  /** ARIA label for the link to the port scanner blog post. */
  portScannerBlogAria: string;
  /** URL of the port scanner blog post. */
  portScannerBlogUrl: string;
  /** Label for the port scanners metric. */
  portScanners: string;
  /** Descriptive text for detected port scanners count. */
  portScannersDetected: string;
  /** Heading for the attack regions section. */
  attackRegions: string;
  /** ARIA label for the attack regions list. */
  attackRegionsList: string;
  /** Text shown when no attack regions are detected. */
  noAttackRegions: string;
  /** Unit label for hit counts in attack regions. */
  hits: string;
  /** Label for the service availability metric. */
  availability: string;
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
  cpu_temp: number;
  top_security_countries: Country[];
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
    "cpu_temp",
  ];

  return (
    requiredNumericFields.every((field) => typeof d[field] === "number") &&
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
 * Formats a number as a percentage string.
 */
function formatPercent(v: number | string) {
  const num = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(num) ? num.toFixed(1) : "...";
}

type StatusKey =
  | "critical"
  | "high"
  | "elevated"
  | "optimal"
  | "healthy"
  | "unknown";

/**
 * Returns a status key based on CPU and Memory usage thresholds.
 */
function getStatus(
  cpu: number | undefined,
  mem: number | undefined,
  labels: { high: StatusKey; medium: StatusKey; normal: StatusKey },
): StatusKey {
  if (cpu === undefined || mem === undefined) return "unknown";
  if (cpu > 90 || mem > 90) return labels.high;
  if (cpu > 70 || mem > 70) return labels.medium;
  return labels.normal;
}

/** Maps a status key to a CSS color class. */
function getStatusColor(status: StatusKey) {
  switch (status) {
    case "critical": {
      return "color-danger";
    }
    case "elevated":
    case "high": {
      return "color-warning";
    }
    case "healthy":
    case "optimal": {
      return "color-success";
    }
    default: {
      return "";
    }
  }
}

/** Maps a status key to its translated display label. */
function getStatusLabel(
  status: StatusKey,
  translations: InfrastructureTranslations,
): string {
  const map: Record<StatusKey, string> = {
    critical: translations.statusCritical,
    high: translations.statusHigh,
    elevated: translations.statusElevated,
    optimal: translations.statusOptimal,
    healthy: translations.statusHealthy,
    unknown: translations.statusUnknown,
  };
  return map[status];
}

/**
 * Infrastructure insights component.
 * Displays real-time statistics from Nginx and InfluxDB.
 *
 * @param props - Component properties including translations.
 */
export default function InfrastructureInsights({ translations: t }: Props) {
  const [stats, setStats] = useState<HomelabStats | null>(null);
  const [error, setError] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    // Refresh interval in milliseconds (30 seconds)
    const REFRESH_INTERVAL = 30_000;

    const fetchStats = async () => {
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        const res = await fetch("/api/homelab/stats", {
          signal: controller.signal,
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
    if (val === undefined || val === null) return "...";
    return formatter ? formatter(val) : val.toLocaleString();
  };

  const countries = stats?.top_security_countries || [];

  const totalSecurityBlocks = stats
    ? (stats.nginx_bans_24h || 0) +
      (stats.tarpit_hits_24h || 0) +
      (stats.mikrotik_scans_total || 0)
    : null;

  const systemStatus = getStatus(
    stats?.cpu_usage_avg,
    stats?.mem_used_percent,
    {
      high: "critical",
      medium: "elevated",
      normal: "healthy",
    },
  );

  const loadStatus = getStatus(stats?.cpu_usage_avg, stats?.mem_used_percent, {
    high: "critical",
    medium: "high",
    normal: "optimal",
  });

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
      className="infrastructure-section"
      aria-label={t.ariaLabel}
    >
      <div className="insights-grid">
        <article
          className="insight-card"
          aria-labelledby="label-traffic"
        >
          <span
            className="insight-label"
            id="label-traffic"
          >
            {t.requestsReceived}
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {displayVal(stats?.requests_received_24h)} {t.requestsReceivedSR}
            </span>
            <span aria-hidden="true">
              <output>{displayVal(stats?.requests_received_24h)}</output>{" "}
              <small>{t.handled}</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-responses">{t.responsesSent}</span>
              <output aria-labelledby="label-responses">
                {displayVal(stats?.responses_sent_24h)}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-upstream">{t.upstream}</span>
              <output aria-labelledby="label-upstream">
                {displayVal(stats?.upstream_sent_24h)}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-bandwidth-up">
                <span className="sr-only">{t.sentPrefix} </span>
                {t.bandwidthUp}
              </span>
              <output aria-labelledby="label-bandwidth-up">
                {displayVal(stats?.bandwidth_sent_24h, formatBytes)}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-bandwidth-down">
                <span className="sr-only">{t.receivedPrefix} </span>
                {t.bandwidthDown}
              </span>
              <output aria-labelledby="label-bandwidth-down">
                {displayVal(stats?.bandwidth_recv_24h, formatBytes)}
              </output>
            </div>
          </div>
        </article>

        <article
          className="insight-card security"
          aria-labelledby="label-security"
        >
          <span
            className="insight-label"
            id="label-security"
          >
            {t.securityBlocks}
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {totalSecurityBlocks?.toLocaleString() ?? t.loading}{" "}
              {t.totalSecurityBlocks}
            </span>
            <span aria-hidden="true">
              {totalSecurityBlocks?.toLocaleString() ?? "..."}{" "}
              <small>{t.blocks}</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-nginx-bans">{t.nginxBans}</span>
              <output aria-labelledby="label-nginx-bans">
                {displayVal(stats?.nginx_bans_24h)}
              </output>
            </div>
            <div className="detail-row">
              <a
                href={t.tarpitBlogUrl}
                className="insight-link"
                aria-label={t.tarpitBlogAria}
              >
                {t.tarpitHits}
              </a>
              <output
                aria-label={`${displayVal(stats?.tarpit_hits_24h)} ${t.tarpitHitsUnit}`}
              >
                {displayVal(stats?.tarpit_hits_24h)}
              </output>
            </div>
            <div className="detail-row">
              <a
                href={t.portScannerBlogUrl}
                className="insight-link"
                aria-label={t.portScannerBlogAria}
              >
                {t.portScanners}
              </a>
              <output
                aria-label={`${displayVal(stats?.mikrotik_scans_total)} ${t.portScannersDetected}`}
              >
                {displayVal(stats?.mikrotik_scans_total)}
              </output>
            </div>
            <div className="detail-row">
              <span className="sr-only">{t.attackRegions}:</span>
              <span aria-hidden="true">{t.attackRegions}</span>
              <ul className="country-list">
                <li className="sr-only">{t.attackRegionsList}</li>
                {countries.length > 0 ? (
                  countries.map((c) => (
                    <li
                      key={c.code}
                      className="country-badge"
                      aria-label={`${c.code} — ${c.count} ${t.hits}`}
                      title={`${c.count} ${t.hits}`}
                    >
                      {c.code}
                    </li>
                  ))
                ) : (
                  <li>
                    <span aria-hidden="true">{stats ? "-" : "..."}</span>
                    <span className="sr-only">{t.noAttackRegions}</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </article>

        <article
          className="insight-card errors"
          aria-labelledby="label-availability"
        >
          <span
            className="insight-label"
            id="label-availability"
          >
            {t.availability}
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {displayVal(stats?.rate_limited_503_24h)} {t.rateLimits}
            </span>
            <span aria-hidden="true">
              {displayVal(stats?.rate_limited_503_24h)}{" "}
              <small>{t.rateLimits}</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-system-status">{t.systemStatus}</span>
              <output
                className={getStatusColor(systemStatus)}
                aria-labelledby="label-system-status"
              >
                {getStatusLabel(systemStatus, t)}
              </output>
            </div>
          </div>
        </article>

        <article
          className="insight-card hardware"
          aria-labelledby="label-hardware"
        >
          <span
            className="insight-label"
            id="label-hardware"
          >
            {t.nodeResourceLoad}
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {t.cpuUsagePrefix}{" "}
              {displayVal(stats?.cpu_usage_avg, formatPercent)} %
            </span>
            <span aria-hidden="true">
              <output>{displayVal(stats?.cpu_usage_avg, formatPercent)}</output>{" "}
              <small>{t.percentCPU}</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-memory">{t.memoryUsage}</span>
              <output aria-labelledby="label-memory">
                {displayVal(stats?.mem_used_percent, formatPercent)}
                <small aria-hidden="true"> {t.percentRAM}</small>
              </output>
            </div>
            <div className="detail-row">
              <span id="label-cpu-temp">{t.cpuTemp}</span>
              <output aria-labelledby="label-cpu-temp">
                {stats?.cpu_temp != null
                  ? `${Math.round(stats.cpu_temp)}°C`
                  : "—"}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-load-status">{t.loadStatus}</span>
              <output
                className={getStatusColor(loadStatus)}
                aria-labelledby="label-load-status"
              >
                {getStatusLabel(loadStatus, t)}
              </output>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
