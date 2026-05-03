import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

/** Translations required by ServerInsights. Passed from Astro parent. */
export interface ServerInsightsTranslations {
  /** ARIA label for the server insights container. */
  ariaLabel: string;
  /** Error message shown when data fetching fails. */
  error: string;
  /** Label for Matrix active workers metric. */
  matrixWorkers: string;
  /** Unit label for workers count. */
  matrixWorkersUnit: string;
  /** Label for Matrix main process status. */
  matrixMainProcess: string;
  /** Status text when Matrix is running. */
  matrixRunning: string;
  /** Status text when Matrix is stopped. */
  matrixStopped: string;
  /** Label for Matrix rooms count. */
  matrixRooms: string;
  /** Label for Matrix local rooms count. */
  matrixLocalRooms: string;
  /** Label for Matrix local users count. */
  matrixUsers: string;
  /** Label for Matrix remote users count. */
  matrixRemoteUsers: string;
  /** Label for Matrix federation heading. */
  matrixFederation: string;
  /** Label for Matrix known federation servers. */
  matrixFederationServers: string;
  /** Label for Matrix total events. */
  matrixTotalEvents: string;
  /** Label for Matrix database size. */
  matrixDbSize: string;
  /** Label for Synapse heading. */
  matrixSynapse: string;
  /** Label for Sidekiq jobs processed. */
  sidekiqJobs: string;
  /** Unit label for jobs processed. */
  sidekiqJobsUnit: string;
  /** Label for Sidekiq failed jobs. */
  sidekiqFailed: string;
  /** Label for Sidekiq retry queue. */
  sidekiqRetry: string;
  /** Label for Sidekiq scheduled jobs. */
  sidekiqScheduled: string;
  /** Label for Sidekiq processes count. */
  sidekiqProcesses: string;
  /** Label for Puma threads count. */
  pumaThreads: string;
  /** Label for ZFS storage heading. */
  storageTitle: string;
  /** Unit label for storage total. */
  storageUnit: string;
  /** Label for ZFS pool health. */
  poolHealth: string;
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
  /** Label for resource load heading. */
  resourceLoad: string;
  /** Label for database connections. */
  dbConnections: string;
  /** Label for Redis memory usage. */
  redisMemory: string;
  /** Label for services heading. */
  services: string;
  /** Label for database heading. */
  database: string;
  /** Label for ZFS ARC cache. */
  arcCache: string;
  /** Label for CPU temperature. */
  cpuTemp: string;
  /** Label for Mastodon federation heading. */
  mastodonFederation: string;
  /** Unit label for Mastodon known domains headline. */
  mastodonKnownDomains: string;
  /** Label for Mastodon known peers count. */
  mastodonKnownPeers: string;
  /** Label for Mastodon database size. */
  mastodonDbSize: string;
  /** Label for Mastodon media storage size. */
  mastodonMediaStorage: string;
  /** Label for MikroTik system card heading. */
  mikrotikSystem: string;
  /** Label for CPU frequency. */
  mikrotikCpuFrequency: string;
  /** Unit for MHz. */
  mikrotikMhz: string;
  /** Label for storage usage. */
  mikrotikStorage: string;
  /** Label for MikroTik network card heading. */
  mikrotikNetwork: string;
  /** Label for WAN download. */
  mikrotikWanDownload: string;
  /** Label for WAN upload. */
  mikrotikWanUpload: string;
  /** Label for WAN total packets. */
  mikrotikWanPackets: string;
  /** Unit for packets. */
  mikrotikPacketsUnit: string;
  /** Label for MikroTik security card heading. */
  mikrotikSecurity: string;
  /** Label for active connections. */
  mikrotikActiveConnections: string;
  /** Label for CrowdSec blocked. */
  mikrotikCrowdsecBlocked: string;
  /** Label for blacklisted scanners. */
  mikrotikBlacklistScanners: string;
  /** Label for honeypot hits. */
  mikrotikHoneypotHits: string;
  /** Label for port scanners dropped. */
  mikrotikPortScanners: string;
}

/** Component props for ServerInsights. */
interface Props {
  readonly type: "matrix" | "mastodon" | "truenas" | "mikrotik";
  readonly translations: ServerInsightsTranslations;
}

interface MatrixStats {
  active_workers: number;
  total_rooms: number;
  total_users: number;
  remote_users: number;
  main_running: boolean;
  local_users: number;
  local_rooms: number;
  federation_destinations: number;
  total_events: number;
  db_size_bytes: number;
  cpu_usage_avg: number;
  mem_used_percent: number;
  cpu_temp: number | null;
  pg_connections: number;
  redis_memory: number;
}

interface MastodonStats {
  sidekiq_processed: number;
  sidekiq_failed: number;
  sidekiq_dead: number;
  sidekiq_processes: number;
  sidekiq_retry: number;
  sidekiq_scheduled: number;
  puma_memory_rss: number;
  puma_threads: number;
  cpu_usage_avg: number;
  mem_used_percent: number;
  cpu_temp: number | null;
  pg_connections: number;
  redis_memory: number;
  user_count: number;
  status_count: number;
  domain_count: number;
  peers_count: number;
  active_month: number;
  db_size_bytes: number;
  media_size_bytes: number;
  instance_version: string;
}

interface ZFSPool {
  name: string;
  size: number;
  alloc: number;
  free: number;
  cap: number;
  health: string;
  frag: number;
}

interface TrueNASStats {
  cpu_usage_avg: number;
  mem_used_percent: number;
  arc_size: number;
  cpu_temp: number | null;
  zfs_pools: ZFSPool[];
}

interface MikroTikStats {
  board: string;
  cpu_load: number;
  cpu_temp: number | null;
  cpu_frequency: number;
  mem_used_percent: number;
  mem_total: number;
  disk_used_percent: number;
  wan_rx_bytes: number;
  wan_tx_bytes: number;
  wan_rx_packets: number;
  wan_tx_packets: number;
  active_connections: number;
  crowdsec_blocked: number;
  blacklist_scanners: number;
  honeypot_hits: number;
  port_scanners_dropped: number;
}

/** Validates that the data matches the MatrixStats shape. */
function isValidMatrixStats(data: unknown): data is MatrixStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.active_workers === "number" &&
    typeof d.total_rooms === "number" &&
    typeof d.total_users === "number" &&
    typeof d.remote_users === "number" &&
    typeof d.main_running === "boolean" &&
    typeof d.local_users === "number" &&
    typeof d.local_rooms === "number" &&
    typeof d.federation_destinations === "number" &&
    typeof d.total_events === "number" &&
    typeof d.db_size_bytes === "number" &&
    typeof d.cpu_usage_avg === "number" &&
    typeof d.mem_used_percent === "number" &&
    (typeof d.cpu_temp === "number" || d.cpu_temp === null) &&
    typeof d.pg_connections === "number" &&
    typeof d.redis_memory === "number"
  );
}

/** Validates that the data matches the MastodonStats shape. */
function isValidMastodonStats(data: unknown): data is MastodonStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.sidekiq_processed === "number" &&
    typeof d.sidekiq_failed === "number" &&
    typeof d.sidekiq_dead === "number" &&
    typeof d.sidekiq_processes === "number" &&
    typeof d.sidekiq_retry === "number" &&
    typeof d.sidekiq_scheduled === "number" &&
    typeof d.puma_memory_rss === "number" &&
    typeof d.puma_threads === "number" &&
    typeof d.cpu_usage_avg === "number" &&
    typeof d.mem_used_percent === "number" &&
    (typeof d.cpu_temp === "number" || d.cpu_temp === null) &&
    typeof d.pg_connections === "number" &&
    typeof d.redis_memory === "number" &&
    typeof d.user_count === "number" &&
    typeof d.status_count === "number" &&
    typeof d.domain_count === "number" &&
    typeof d.peers_count === "number" &&
    typeof d.active_month === "number" &&
    typeof d.db_size_bytes === "number" &&
    typeof d.media_size_bytes === "number" &&
    typeof d.instance_version === "string"
  );
}

/** Validates that the data matches the TrueNASStats shape. */
function isValidTrueNASStats(data: unknown): data is TrueNASStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.cpu_usage_avg === "number" &&
    typeof d.mem_used_percent === "number" &&
    typeof d.arc_size === "number" &&
    (typeof d.cpu_temp === "number" || d.cpu_temp === null) &&
    Array.isArray(d.zfs_pools) &&
    d.zfs_pools.every(
      (p: unknown) =>
        p &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).name === "string" &&
        typeof (p as Record<string, unknown>).size === "number" &&
        typeof (p as Record<string, unknown>).alloc === "number" &&
        typeof (p as Record<string, unknown>).free === "number" &&
        typeof (p as Record<string, unknown>).cap === "number" &&
        typeof (p as Record<string, unknown>).health === "string" &&
        typeof (p as Record<string, unknown>).frag === "number",
    )
  );
}

/** Validates that the data matches the MikroTikStats shape. */
function isValidMikroTikStats(data: unknown): data is MikroTikStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.board === "string" &&
    typeof d.cpu_load === "number" &&
    (typeof d.cpu_temp === "number" || d.cpu_temp === null) &&
    typeof d.cpu_frequency === "number" &&
    typeof d.mem_used_percent === "number" &&
    typeof d.mem_total === "number" &&
    typeof d.disk_used_percent === "number" &&
    typeof d.wan_rx_bytes === "number" &&
    typeof d.wan_tx_bytes === "number" &&
    typeof d.wan_rx_packets === "number" &&
    typeof d.wan_tx_packets === "number" &&
    typeof d.active_connections === "number" &&
    typeof d.crowdsec_blocked === "number" &&
    typeof d.blacklist_scanners === "number" &&
    typeof d.honeypot_hits === "number" &&
    typeof d.port_scanners_dropped === "number"
  );
}

/** Formats bytes to a human-readable string (e.g., "1.34 GB"). */
function formatBytes(bytes: number | string): string {
  const numBytes = typeof bytes === "string" ? Number.parseFloat(bytes) : bytes;
  if (!Number.isFinite(numBytes) || numBytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(k));
  const clampedI = Math.max(0, Math.min(i, sizes.length - 1));
  return `${Number.parseFloat((numBytes / Math.pow(k, clampedI)).toFixed(2))} ${sizes[clampedI]}`;
}

/** Formats a number as a percentage string with one decimal. */
function formatPercent(v: number | string): string {
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

/** Returns a status key based on CPU and Memory usage thresholds. */
function getStatus(
  cpu: number | undefined,
  mem: number | undefined,
): StatusKey {
  if (cpu === undefined || mem === undefined) return "unknown";
  if (cpu > 90 || mem > 90) return "critical";
  if (cpu > 70 || mem > 70) return "high";
  return "optimal";
}

/** Maps a status key to a CSS color class. */
function getStatusColor(status: StatusKey): string {
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
  translations: ServerInsightsTranslations,
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

/** Maps ZFS pool health to CSS color class. */
function getHealthColor(health: string): string {
  const h = health.toUpperCase();
  if (h === "ONLINE") return "color-success";
  if (h === "DEGRADED") return "color-warning";
  if (h === "FAULTED" || h === "OFFLINE") return "color-danger";
  return "";
}

/** Renders a resource load card with CPU, memory, temperature, and status. */
function ResourceLoadCard({
  labelId,
  label,
  cpuUsage,
  memUsage,
  cpuTemp,
  loadStatus,
  t,
  fmtVal,
}: {
  readonly labelId: string;
  readonly label: string;
  readonly cpuUsage: number;
  readonly memUsage: number;
  readonly cpuTemp: number | null;
  readonly loadStatus: StatusKey;
  readonly t: ServerInsightsTranslations;
  readonly fmtVal: (
    val: number | null | undefined,
    f?: (v: number | string) => string,
  ) => string;
}): JSX.Element {
  return (
    <article
      className="insight-card hardware"
      aria-labelledby={labelId}
    >
      <span
        className="insight-label"
        id={labelId}
      >
        {label}
      </span>
      <div className="insight-value">
        <span className="sr-only">
          {t.cpuUsagePrefix} {fmtVal(cpuUsage, formatPercent)} %
        </span>
        <span aria-hidden="true">
          <output>{fmtVal(cpuUsage, formatPercent)}</output>{" "}
          <small>{t.percentCPU}</small>
        </span>
      </div>
      <div className="insight-details">
        <div className="detail-row">
          <span>{t.memoryUsage}</span>
          <output>
            {fmtVal(memUsage, formatPercent)}
            <small aria-hidden="true"> {t.percentRAM}</small>
          </output>
        </div>
        {cpuTemp == null ? null : (
          <div className="detail-row">
            <span>{t.cpuTemp}</span>
            <output>{Math.round(cpuTemp)}°C</output>
          </div>
        )}
        <div className="detail-row">
          <span>{t.loadStatus}</span>
          <output className={getStatusColor(loadStatus)}>
            {getStatusLabel(loadStatus, t)}
          </output>
        </div>
      </div>
    </article>
  );
}

/**
 * Server insights component for Matrix, Mastodon, TrueNAS, and MikroTik.
 * Displays real-time statistics fetched from `/api/homelab/{type}` endpoints.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Multi-view component with inherent branching per server type
export default function ServerInsights({
  type,
  translations: t,
}: Props): JSX.Element {
  const [stats, setStats] = useState<
    MatrixStats | MastodonStats | TrueNASStats | MikroTikStats | null
  >(null);
  const [error, setError] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const REFRESH_INTERVAL = 30_000;
    const endpoint = `/api/homelab/${type}`;

    const fetchStats = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: { "X-Homelab-Token": token },
        });
        if (res.ok) {
          const data: unknown = await res.json();
          let isValid = false;
          switch (type) {
            case "matrix": {
              isValid = isValidMatrixStats(data);
              break;
            }
            case "mastodon": {
              isValid = isValidMastodonStats(data);
              break;
            }
            case "truenas": {
              isValid = isValidTrueNASStats(data);
              break;
            }
            case "mikrotik": {
              isValid = isValidMikroTikStats(data);
              break;
            }
          }

          if (isValid) {
            setStats(
              data as
                | MatrixStats
                | MastodonStats
                | TrueNASStats
                | MikroTikStats,
            );
            setError(false);
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      } catch (error_: unknown) {
        if (error_ instanceof DOMException && error_.name === "AbortError")
          return;
        setError(true);
      } finally {
        isFetchingRef.current = false;
      }
    };

    void fetchStats();
    const intervalId = setInterval(() => void fetchStats(), REFRESH_INTERVAL);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, [type]);

  /** Format a value for display. */
  const fmtVal = (
    val: number | null | undefined,
    formatter?: (v: number | string) => string,
  ): string => {
    if (val === undefined || val === null) return "...";
    return formatter ? formatter(val) : val.toLocaleString();
  };

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

  // Matrix view
  if (type === "matrix" && stats) {
    const s = stats as MatrixStats;
    const loadStatus = getStatus(s.cpu_usage_avg, s.mem_used_percent);

    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="insights-grid">
          <article
            className="insight-card"
            aria-labelledby="label-matrix-synapse"
          >
            <span
              className="insight-label"
              id="label-matrix-synapse"
            >
              {t.matrixSynapse}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.active_workers)} {t.matrixWorkersUnit}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.active_workers)}</output>{" "}
                <small>{t.matrixWorkersUnit}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.matrixMainProcess}</span>
                <output
                  className={s.main_running ? "color-success" : "color-danger"}
                >
                  {s.main_running ? t.matrixRunning : t.matrixStopped}
                </output>
              </div>
              <div className="detail-row">
                <span>{t.matrixRooms}</span>
                <output>{fmtVal(s.total_rooms)}</output>
              </div>
              <div className="detail-row">
                <span>{t.matrixLocalRooms}</span>
                <output>{fmtVal(s.local_rooms)}</output>
              </div>
            </div>
          </article>

          <article
            className="insight-card"
            aria-labelledby="label-matrix-federation"
          >
            <span
              className="insight-label"
              id="label-matrix-federation"
            >
              {t.matrixFederation}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.federation_destinations)} {t.matrixFederationServers}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.federation_destinations)}</output>{" "}
                <small>{t.matrixFederationServers}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.matrixUsers}</span>
                <output>{fmtVal(s.local_users)}</output>
              </div>
              <div className="detail-row">
                <span>{t.matrixRemoteUsers}</span>
                <output>{fmtVal(s.remote_users)}</output>
              </div>
            </div>
          </article>

          <ResourceLoadCard
            labelId="label-matrix-resources"
            label={t.resourceLoad}
            cpuUsage={s.cpu_usage_avg}
            memUsage={s.mem_used_percent}
            cpuTemp={s.cpu_temp}
            loadStatus={loadStatus}
            t={t}
            fmtVal={fmtVal}
          />

          <article
            className="insight-card"
            aria-labelledby="label-matrix-database"
          >
            <span
              className="insight-label"
              id="label-matrix-database"
            >
              {t.database}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.db_size_bytes, formatBytes)} {t.matrixDbSize}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.db_size_bytes, formatBytes)}</output>{" "}
                <small>{t.matrixDbSize}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.matrixTotalEvents}</span>
                <output>{fmtVal(s.total_events)}</output>
              </div>
              <div className="detail-row">
                <span>{t.dbConnections}</span>
                <output>{fmtVal(s.pg_connections)}</output>
              </div>
              <div className="detail-row">
                <span>{t.redisMemory}</span>
                <output>{fmtVal(s.redis_memory, formatBytes)}</output>
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  }

  // Mastodon view
  if (type === "mastodon" && stats) {
    const s = stats as MastodonStats;
    const loadStatus = getStatus(s.cpu_usage_avg, s.mem_used_percent);

    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="insights-grid">
          <article
            className="insight-card"
            aria-labelledby="label-mastodon-sidekiq"
          >
            <span
              className="insight-label"
              id="label-mastodon-sidekiq"
            >
              {t.sidekiqJobs}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.sidekiq_processed)} {t.sidekiqJobsUnit}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.sidekiq_processed)}</output>{" "}
                <small>{t.sidekiqJobsUnit}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.sidekiqFailed}</span>
                <output>{fmtVal(s.sidekiq_failed)}</output>
              </div>
              <div className="detail-row">
                <span>{t.sidekiqRetry}</span>
                <output>{fmtVal(s.sidekiq_retry)}</output>
              </div>
              <div className="detail-row">
                <span>{t.sidekiqScheduled}</span>
                <output>{fmtVal(s.sidekiq_scheduled)}</output>
              </div>
            </div>
          </article>

          <ResourceLoadCard
            labelId="label-mastodon-resources"
            label={t.resourceLoad}
            cpuUsage={s.cpu_usage_avg}
            memUsage={s.mem_used_percent}
            cpuTemp={s.cpu_temp}
            loadStatus={loadStatus}
            t={t}
            fmtVal={fmtVal}
          />

          <article
            className="insight-card"
            aria-labelledby="label-mastodon-services"
          >
            <span
              className="insight-label"
              id="label-mastodon-services"
            >
              {t.services}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.puma_threads)} {t.pumaThreads}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.puma_threads)}</output>{" "}
                <small>{t.pumaThreads}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.dbConnections}</span>
                <output>{fmtVal(s.pg_connections)}</output>
              </div>
              <div className="detail-row">
                <span>{t.redisMemory}</span>
                <output>{fmtVal(s.redis_memory, formatBytes)}</output>
              </div>
            </div>
          </article>

          <article
            className="insight-card"
            aria-labelledby="label-mastodon-federation"
          >
            <span
              className="insight-label"
              id="label-mastodon-federation"
            >
              {t.mastodonFederation}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.domain_count)} {t.mastodonKnownDomains}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.domain_count)}</output>{" "}
                <small>{t.mastodonKnownDomains}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.mastodonKnownPeers}</span>
                <output>{fmtVal(s.peers_count)}</output>
              </div>
              <div className="detail-row">
                <span>{t.mastodonDbSize}</span>
                <output>{fmtVal(s.db_size_bytes, formatBytes)}</output>
              </div>
              <div className="detail-row">
                <span>{t.mastodonMediaStorage}</span>
                <output>{fmtVal(s.media_size_bytes, formatBytes)}</output>
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  }

  // TrueNAS view
  if (type === "truenas" && stats) {
    const s = stats as TrueNASStats;
    const loadStatus = getStatus(s.cpu_usage_avg, s.mem_used_percent);

    // Map internal pool names to public display labels and exclude boot-pool
    const poolDisplayNames: Record<string, string> = {
      Datos: "Volume 1 (data)",
      Apps: "Volume 2 (apps)",
      Backups: "Volume 3 (backups)",
    };
    const visiblePools = s.zfs_pools.filter(
      (p) => p.name !== "boot-pool" && poolDisplayNames[p.name],
    );

    const totalCapacity = visiblePools.reduce(
      (sum, pool) => sum + pool.size,
      0,
    );
    const totalTB = totalCapacity / Math.pow(1024, 4);

    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="insights-grid">
          <article
            className="insight-card"
            aria-labelledby="label-truenas-storage"
          >
            <span
              className="insight-label"
              id="label-truenas-storage"
            >
              {t.storageTitle}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {totalTB.toFixed(1)} TB {t.storageUnit}
              </span>
              <span aria-hidden="true">
                <output>{totalTB.toFixed(1)}</output>{" "}
                <small>TB {t.storageUnit}</small>
              </span>
            </div>
            <div className="insight-details">
              {visiblePools.map((pool) => (
                <div
                  key={pool.name}
                  className="detail-row"
                >
                  <span>
                    {poolDisplayNames[pool.name]} ({pool.cap}%)
                  </span>
                  <output className={getHealthColor(pool.health)}>
                    {pool.health}
                  </output>
                </div>
              ))}
            </div>
          </article>

          <article
            className="insight-card"
            aria-labelledby="label-truenas-system"
          >
            <span
              className="insight-label"
              id="label-truenas-system"
            >
              {t.arcCache}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.arc_size, formatBytes)} {t.arcCache}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.arc_size, formatBytes)}</output>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.cpuTemp}</span>
                <output>
                  {s.cpu_temp == null ? "—" : `${Math.round(s.cpu_temp)}°C`}
                </output>
              </div>
            </div>
          </article>

          <ResourceLoadCard
            labelId="label-truenas-resources"
            label={t.resourceLoad}
            cpuUsage={s.cpu_usage_avg}
            memUsage={s.mem_used_percent}
            cpuTemp={null}
            loadStatus={loadStatus}
            t={t}
            fmtVal={fmtVal}
          />
        </div>
      </section>
    );
  }

  // MikroTik view
  if (type === "mikrotik" && stats) {
    const s = stats as MikroTikStats;
    const loadStatus = getStatus(s.cpu_load, s.mem_used_percent);

    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="insights-grid">
          <article
            className="insight-card hardware"
            aria-labelledby="label-mikrotik-system"
          >
            <span
              className="insight-label"
              id="label-mikrotik-system"
            >
              {t.mikrotikSystem}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {t.cpuUsagePrefix} {fmtVal(s.cpu_load, formatPercent)} %
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.cpu_load, formatPercent)}</output>{" "}
                <small>{t.percentCPU}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.cpuTemp}</span>
                <output>
                  {s.cpu_temp == null ? "—" : `${Math.round(s.cpu_temp)}°C`}
                </output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikCpuFrequency}</span>
                <output>
                  {s.cpu_frequency} {t.mikrotikMhz}
                </output>
              </div>
              <div className="detail-row">
                <span>{t.memoryUsage}</span>
                <output>
                  {fmtVal(s.mem_used_percent, formatPercent)}
                  <small aria-hidden="true"> {t.percentRAM}</small>
                </output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikStorage}</span>
                <output>{fmtVal(s.disk_used_percent, formatPercent)}%</output>
              </div>
              <div className="detail-row">
                <span>{t.loadStatus}</span>
                <output className={getStatusColor(loadStatus)}>
                  {getStatusLabel(loadStatus, t)}
                </output>
              </div>
            </div>
          </article>

          <article
            className="insight-card"
            aria-labelledby="label-mikrotik-network"
          >
            <span
              className="insight-label"
              id="label-mikrotik-network"
            >
              {t.mikrotikNetwork}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.wan_rx_bytes, formatBytes)} {t.mikrotikWanDownload}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.wan_rx_bytes, formatBytes)}</output>{" "}
                <small>{t.mikrotikWanDownload}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.mikrotikWanUpload}</span>
                <output>{fmtVal(s.wan_tx_bytes, formatBytes)}</output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikWanPackets}</span>
                <output>
                  {((s.wan_rx_packets + s.wan_tx_packets) / 1_000_000).toFixed(
                    1,
                  )}
                  M <small>{t.mikrotikPacketsUnit}</small>
                </output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikActiveConnections}</span>
                <output>{fmtVal(s.active_connections)}</output>
              </div>
            </div>
          </article>

          <article
            className="insight-card"
            aria-labelledby="label-mikrotik-security"
          >
            <span
              className="insight-label"
              id="label-mikrotik-security"
            >
              {t.mikrotikSecurity}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {fmtVal(s.crowdsec_blocked)} {t.mikrotikCrowdsecBlocked}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.crowdsec_blocked)}</output>{" "}
                <small>{t.mikrotikCrowdsecBlocked}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.mikrotikBlacklistScanners}</span>
                <output>{fmtVal(s.blacklist_scanners)}</output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikHoneypotHits}</span>
                <output>{fmtVal(s.honeypot_hits)}</output>
              </div>
              <div className="detail-row">
                <span>{t.mikrotikPortScanners}</span>
                <output>{fmtVal(s.port_scanners_dropped)}</output>
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  }

  // Loading state
  return (
    <section
      className="infrastructure-section"
      aria-label={t.ariaLabel}
    >
      <div className="insights-grid">
        <article className="insight-card">
          <span className="insight-label">...</span>
          <div className="insight-value">
            <output>...</output>
          </div>
        </article>
      </div>
    </section>
  );
}
