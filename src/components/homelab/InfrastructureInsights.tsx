import { useEffect, useRef, useState } from "preact/hooks";

interface Country {
  code: string;
  count: number;
}

interface HomelabStats {
  requests_received_24h: number;
  responses_sent_24h: number;
  upstream_sent_24h: number;
  bandwidth_bytes_1h: number;
  tarpit_hits_24h: number;
  nginx_bans_24h: number;
  mikrotik_scans_total: number;
  rate_limited_503_24h: number;
  cpu_usage_avg: number;
  mem_used_percent: number;
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
    "bandwidth_bytes_1h",
    "tarpit_hits_24h",
    "nginx_bans_24h",
    "mikrotik_scans_total",
    "rate_limited_503_24h",
    "cpu_usage_avg",
    "mem_used_percent",
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

type StatusLevel =
  | "Critical"
  | "High"
  | "Elevated"
  | "Optimal"
  | "Healthy"
  | "Unknown";

/**
 * Returns a status label based on CPU and Memory usage thresholds.
 */
function getStatus(
  cpu: number | undefined,
  mem: number | undefined,
  labels: { high: StatusLevel; medium: StatusLevel; normal: StatusLevel },
): StatusLevel {
  if (cpu === undefined || mem === undefined) return "Unknown";
  if (cpu > 90 || mem > 90) return labels.high;
  if (cpu > 70 || mem > 70) return labels.medium;
  return labels.normal;
}

function getStatusColor(status: StatusLevel) {
  switch (status) {
    case "Critical": {
      return "color-danger";
    }
    case "Elevated":
    case "High": {
      return "color-warning";
    }
    case "Healthy":
    case "Optimal": {
      return "color-success";
    }
    default: {
      return "";
    }
  }
}

/**
 * Infrastructure insights component.
 * Displays real-time statistics from Nginx and InfluxDB.
 */
export default function InfrastructureInsights() {
  const [stats, setStats] = useState<HomelabStats | null>(null);
  const [error, setError] = useState(false);
  const [isLocalDev, setIsLocalDev] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (
      globalThis.window !== undefined &&
      (globalThis.window.location.hostname === "localhost" ||
        globalThis.window.location.hostname === "127.0.0.1")
    ) {
      console.info("InfrastructureInsights: Data fetch disabled on localhost");
      setIsLocalDev(true);
      return;
    }

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
    ? (stats.nginx_bans_24h || 0) + (stats.tarpit_hits_24h || 0)
    : null;

  const systemStatus = getStatus(
    stats?.cpu_usage_avg,
    stats?.mem_used_percent,
    {
      high: "Critical",
      medium: "Elevated",
      normal: "Healthy",
    },
  );

  const loadStatus = getStatus(stats?.cpu_usage_avg, stats?.mem_used_percent, {
    high: "Critical",
    medium: "High",
    normal: "Optimal",
  });

  if (isLocalDev) {
    return (
      <section
        className="infrastructure-section"
        aria-label="Edge node real-time statistics"
      >
        <div className="stats-loading">
          Local development mode: data fetch disabled
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="infrastructure-section"
        aria-label="Edge node real-time statistics"
      >
        <div className="stats-error">
          Unable to load infrastructure statistics.
        </div>
      </section>
    );
  }

  return (
    <section
      className="infrastructure-section"
      aria-label="Edge node real-time statistics"
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
            Requests Received (24h)
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {displayVal(stats?.requests_received_24h)} requests received
            </span>
            <span aria-hidden="true">
              <output>{displayVal(stats?.requests_received_24h)}</output>{" "}
              <small>handled</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-responses">Responses Sent</span>
              <output aria-labelledby="label-responses">
                {displayVal(stats?.responses_sent_24h)}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-upstream">Upstream (Forwarded)</span>
              <output aria-labelledby="label-upstream">
                {displayVal(stats?.upstream_sent_24h)}
              </output>
            </div>
            <div className="detail-row">
              <span id="label-bandwidth">Bandwidth (1h)</span>
              <output aria-labelledby="label-bandwidth">
                {displayVal(stats?.bandwidth_bytes_1h, formatBytes)}
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
            Security & Blocks (24h)
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {totalSecurityBlocks?.toLocaleString() ?? "Loading"} total
              security blocks
            </span>
            <span aria-hidden="true">
              {totalSecurityBlocks?.toLocaleString() ?? "..."}{" "}
              <small>blocks</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-nginx-bans">Nginx Bans</span>
              <output aria-labelledby="label-nginx-bans">
                {displayVal(stats?.nginx_bans_24h)}
              </output>
            </div>
            <div className="detail-row">
              <a
                href="/blog/005-implementing-tarpit-nginx/"
                className="insight-link"
                aria-label="Read blog post about implementing Nginx Tarpit"
              >
                Tarpit Hits
              </a>
              <output
                aria-label={`${displayVal(stats?.tarpit_hits_24h)} tarpit hits`}
              >
                {displayVal(stats?.tarpit_hits_24h)}
              </output>
            </div>
            <div className="detail-row">
              <a
                href="/blog/006-implementing-mikrotik-honeypot/"
                className="insight-link"
                aria-label="Read blog post about MikroTik Port Scanner Honeypot"
              >
                Port Scanners
              </a>
              <output
                aria-label={`${displayVal(stats?.mikrotik_scans_total)} port scanners detected`}
              >
                {displayVal(stats?.mikrotik_scans_total)}
              </output>
            </div>
            <div className="detail-row">
              <span className="sr-only">Attack Regions:</span>
              <span aria-hidden="true">Attack Regions</span>
              <ul className="country-list">
                <li className="sr-only">List of attack regions:</li>
                {countries.length > 0 ? (
                  countries.map((c) => (
                    <li
                      key={c.code}
                      className="country-badge"
                      aria-label={`Region ${c.code} with ${c.count} hits`}
                      title={`${c.count} hits`}
                    >
                      {c.code}
                    </li>
                  ))
                ) : (
                  <li>
                    <span aria-hidden="true">{stats ? "-" : "..."}</span>
                    <span className="sr-only">No attack regions recorded</span>
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
            Availability (24h)
          </span>
          <div className="insight-value">
            <span className="sr-only">
              {displayVal(stats?.rate_limited_503_24h)} rate limits
            </span>
            <span aria-hidden="true">
              {displayVal(stats?.rate_limited_503_24h)}{" "}
              <small>rate limits</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-system-status">System Status</span>
              <output
                className={getStatusColor(systemStatus)}
                aria-labelledby="label-system-status"
              >
                {systemStatus}
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
            Node Resource Load
          </span>
          <div className="insight-value">
            <span className="sr-only">
              CPU usage: {displayVal(stats?.cpu_usage_avg, formatPercent)} %
            </span>
            <span aria-hidden="true">
              <output>{displayVal(stats?.cpu_usage_avg, formatPercent)}</output>{" "}
              <small>% CPU</small>
            </span>
          </div>
          <div className="insight-details">
            <div className="detail-row">
              <span id="label-memory">Memory Usage</span>
              <output aria-labelledby="label-memory">
                {displayVal(stats?.mem_used_percent, formatPercent)}
                <small aria-hidden="true"> % RAM</small>
              </output>
            </div>
            <div className="detail-row">
              <span id="label-load-status">Load Status</span>
              <output
                className={getStatusColor(loadStatus)}
                aria-labelledby="label-load-status"
              >
                {loadStatus}
              </output>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
