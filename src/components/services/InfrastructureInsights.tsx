import { useEffect, useState } from "preact/hooks";

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
 * Formats bytes to a human-readable string.
 * @param bytes - The number of bytes.
 */
function formatBytes(bytes: number | string) {
  const numBytes = typeof bytes === "string" ? Number.parseFloat(bytes) : bytes;
  if (!numBytes || numBytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  return `${Number.parseFloat((numBytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Infrastructure insights component.
 * Displays real-time statistics from Nginx and InfluxDB.
 */
export default function InfrastructureInsights() {
  const [stats, setStats] = useState<HomelabStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (
        globalThis.window !== undefined &&
        (globalThis.window.location.hostname === "localhost" ||
          globalThis.window.location.hostname === "127.0.0.1")
      ) {
        return;
      }

      try {
        const res = await fetch("/api/homelab/stats");
        if (res.ok) {
          const data = (await res.json()) as HomelabStats;
          setStats(data);
        }
      } catch (error: unknown) {
        console.error("Failed to fetch infrastructure stats", error);
      }
    };

    void fetchStats();
  }, []);

  const displayVal = (
    val: number | string | undefined,
    formatter?: (v: number | string) => string,
  ) => {
    if (val === undefined || val === null) return "...";
    return formatter ? formatter(val) : val.toLocaleString();
  };

  const countries = stats?.top_security_countries || [];

  return (
    <section
      class="infrastructure-section"
      aria-label="Edge node real-time statistics"
    >
      <div class="insights-grid">
        <article
          class="insight-card"
          aria-labelledby="label-traffic"
        >
          <span
            class="insight-label"
            id="label-traffic"
          >
            Requests Received (24h)
          </span>
          <div class="insight-value">
            <span class="visually-hidden">
              {displayVal(stats?.requests_received_24h)} requests received
            </span>
            <span aria-hidden="true">
              {displayVal(stats?.requests_received_24h)} <small>handled</small>
            </span>
          </div>
          <div class="insight-details">
            <div class="detail-row">
              <span>Responses Sent</span>
              <strong>
                <span class="visually-hidden">
                  {displayVal(stats?.responses_sent_24h)} responses sent
                </span>
                <span aria-hidden="true">
                  {displayVal(stats?.responses_sent_24h)}
                </span>
              </strong>
            </div>
            <div class="detail-row">
              <span>Upstream (Forwarded)</span>
              <strong>
                <span class="visually-hidden">
                  {displayVal(stats?.upstream_sent_24h)} requests forwarded
                </span>
                <span aria-hidden="true">
                  {displayVal(stats?.upstream_sent_24h)}
                </span>
              </strong>
            </div>
            <div class="detail-row">
              <span>Bandwidth (1h)</span>
              <strong>
                <span class="visually-hidden">
                  Bandwidth:{" "}
                  {displayVal(stats?.bandwidth_bytes_1h, formatBytes)}
                </span>
                <span aria-hidden="true">
                  {displayVal(stats?.bandwidth_bytes_1h, formatBytes)}
                </span>
              </strong>
            </div>
          </div>
        </article>

        <article
          class="insight-card security"
          aria-labelledby="label-security"
        >
          <span
            class="insight-label"
            id="label-security"
          >
            Security & Blocks (24h)
          </span>
          <div class="insight-value">
            <span class="visually-hidden">
              {stats
                ? (
                    (stats.nginx_bans_24h || 0) +
                    (stats.tarpit_hits_24h || 0) +
                    (stats.mikrotik_scans_total || 0)
                  ).toLocaleString()
                : "..."}{" "}
              total security blocks
            </span>
            <span aria-hidden="true">
              {stats
                ? (
                    (stats.nginx_bans_24h || 0) +
                    (stats.tarpit_hits_24h || 0) +
                    (stats.mikrotik_scans_total || 0)
                  ).toLocaleString()
                : "..."}{" "}
              <small>blocks</small>
            </span>
          </div>
          <div class="insight-details">
            <div class="detail-row">
              <span>Nginx Bans</span>
              <strong>{displayVal(stats?.nginx_bans_24h)}</strong>
            </div>
            <div class="detail-row">
              <span>Tarpit Hits</span>
              <strong>{displayVal(stats?.tarpit_hits_24h)}</strong>
            </div>
            <div class="detail-row">
              <span>Port Scanners</span>
              <strong>{displayVal(stats?.mikrotik_scans_total)}</strong>
            </div>
            <div class="detail-row">
              <span id="label-attack-regions">Attack Regions</span>
              <ul class="country-list">
                {countries.length > 0 ? (
                  countries.map((c) => (
                    <li
                      key={c.code}
                      class="country-badge"
                      aria-label={`Region ${c.code} with ${c.count} hits`}
                      title={`${c.count} hits`}
                    >
                      {c.code}
                    </li>
                  ))
                ) : (
                  <li aria-hidden="true">{stats ? "-" : "..."}</li>
                )}
              </ul>
            </div>
          </div>
        </article>

        <article
          class="insight-card errors"
          aria-labelledby="label-availability"
        >
          <span
            class="insight-label"
            id="label-availability"
          >
            Availability (24h)
          </span>
          <div class="insight-value">
            <span class="visually-hidden">
              {displayVal(stats?.rate_limited_503_24h)} rate limits
            </span>
            <span aria-hidden="true">
              {displayVal(stats?.rate_limited_503_24h)}{" "}
              <small>rate limits</small>
            </span>
          </div>
          <div class="insight-details">
            <div class="detail-row">
              <span>Rate Limited (503)</span>
              <strong class="color-info">
                {displayVal(stats?.rate_limited_503_24h)}
              </strong>
            </div>
            <div class="detail-row">
              <span>System Status</span>
              <strong class="color-success">Healthy</strong>
            </div>
          </div>
        </article>

        <article
          class="insight-card hardware"
          aria-labelledby="label-hardware"
        >
          <span
            class="insight-label"
            id="label-hardware"
          >
            Node Resource Load
          </span>
          <div class="insight-value">
            <span class="visually-hidden">
              CPU usage: {stats ? stats.cpu_usage_avg.toFixed(1) : "..."} %
            </span>
            <span aria-hidden="true">
              {stats ? stats.cpu_usage_avg.toFixed(1) : "..."}{" "}
              <small>% CPU</small>
            </span>
          </div>
          <div class="insight-details">
            <div class="detail-row">
              <span>Memory Usage</span>
              <strong>
                <span class="visually-hidden">
                  Memory: {stats ? stats.mem_used_percent.toFixed(1) : "..."} %
                </span>
                <span aria-hidden="true">
                  {stats ? stats.mem_used_percent.toFixed(1) : "..."}%
                </span>
              </strong>
            </div>
            <div class="detail-row">
              <span>Load Status</span>
              <strong>Optimal</strong>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
