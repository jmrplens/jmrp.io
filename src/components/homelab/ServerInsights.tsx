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
  /** Label for Matrix federated users count. */
  matrixUsers: string;
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
  /** Label for Docker containers heading. */
  containersTitle: string;
  /** Unit label for running containers. */
  containersRunning: string;
  /** Label for uptime heading. */
  uptimeTitle: string;
  /** Unit label for days. */
  uptimeDays: string;
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
  /** Label for total containers. */
  dockerTotal: string;
  /** Label for total images. */
  dockerImages: string;
}

/** Component props for ServerInsights. */
interface Props {
  readonly type: "matrix" | "mastodon" | "truenas" | "docker";
  readonly translations: ServerInsightsTranslations;
}

interface MatrixStats {
  active_workers: number;
  total_rooms: number;
  total_users: number;
  main_running: boolean;
  cpu_usage_avg: number;
  mem_used_percent: number;
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
  pg_connections: number;
  redis_memory: number;
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
  uptime: number;
  arc_size: number;
  cpu_temp: number;
  zfs_pools: ZFSPool[];
}

interface DockerHost {
  name: string;
  containers_running: number;
  containers_total: number;
  images: number;
}

interface DockerStats {
  hosts: DockerHost[];
  total_running: number;
  total_containers: number;
  total_images: number;
}

/** Validates that the data matches the MatrixStats shape. */
function isValidMatrixStats(data: unknown): data is MatrixStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.active_workers === "number" &&
    typeof d.total_rooms === "number" &&
    typeof d.total_users === "number" &&
    typeof d.main_running === "boolean" &&
    typeof d.cpu_usage_avg === "number" &&
    typeof d.mem_used_percent === "number" &&
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
    typeof d.pg_connections === "number" &&
    typeof d.redis_memory === "number"
  );
}

/** Validates that the data matches the TrueNASStats shape. */
function isValidTrueNASStats(data: unknown): data is TrueNASStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.cpu_usage_avg === "number" &&
    typeof d.mem_used_percent === "number" &&
    typeof d.uptime === "number" &&
    typeof d.arc_size === "number" &&
    typeof d.cpu_temp === "number" &&
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

/** Validates that the data matches the DockerStats shape. */
function isValidDockerStats(data: unknown): data is DockerStats {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.total_running === "number" &&
    typeof d.total_containers === "number" &&
    typeof d.total_images === "number" &&
    Array.isArray(d.hosts) &&
    d.hosts.every(
      (h: unknown) =>
        h &&
        typeof h === "object" &&
        typeof (h as Record<string, unknown>).name === "string" &&
        typeof (h as Record<string, unknown>).containers_running === "number" &&
        typeof (h as Record<string, unknown>).containers_total === "number" &&
        typeof (h as Record<string, unknown>).images === "number",
    )
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

/**
 * Server insights component for Matrix, Mastodon, TrueNAS, and Docker.
 * Displays real-time statistics fetched from `/api/homelab/{type}` endpoints.
 */
export default function ServerInsights({
  type,
  translations: t,
}: Props): preact.JSX.Element {
  const [stats, setStats] = useState<
    MatrixStats | MastodonStats | TrueNASStats | DockerStats | null
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
        const res = await fetch(endpoint, { signal: controller.signal });
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
            case "docker": {
              isValid = isValidDockerStats(data);
              break;
            }
          }

          if (isValid) {
            setStats(
              data as MatrixStats | MastodonStats | TrueNASStats | DockerStats,
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
            aria-labelledby="label-matrix-workers"
          >
            <span
              className="insight-label"
              id="label-matrix-workers"
            >
              {t.matrixWorkers}
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
            </div>
          </article>

          <article
            className="insight-card hardware"
            aria-labelledby="label-matrix-resources"
          >
            <span
              className="insight-label"
              id="label-matrix-resources"
            >
              {t.resourceLoad}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {t.cpuUsagePrefix} {fmtVal(s.cpu_usage_avg, formatPercent)} %
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.cpu_usage_avg, formatPercent)}</output>{" "}
                <small>{t.percentCPU}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.memoryUsage}</span>
                <output>
                  {fmtVal(s.mem_used_percent, formatPercent)}
                  <small aria-hidden="true"> {t.percentRAM}</small>
                </output>
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
                {fmtVal(s.pg_connections)} {t.dbConnections}
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.pg_connections)}</output>{" "}
                <small>{t.dbConnections}</small>
              </span>
            </div>
            <div className="insight-details">
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

          <article
            className="insight-card hardware"
            aria-labelledby="label-mastodon-resources"
          >
            <span
              className="insight-label"
              id="label-mastodon-resources"
            >
              {t.resourceLoad}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {t.cpuUsagePrefix} {fmtVal(s.cpu_usage_avg, formatPercent)} %
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.cpu_usage_avg, formatPercent)}</output>{" "}
                <small>{t.percentCPU}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.memoryUsage}</span>
                <output>
                  {fmtVal(s.mem_used_percent, formatPercent)}
                  <small aria-hidden="true"> {t.percentRAM}</small>
                </output>
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
    const uptimeDays = Math.floor(s.uptime / 86_400);

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
              {t.uptimeTitle}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {uptimeDays} {t.uptimeDays}
              </span>
              <span aria-hidden="true">
                <output>{uptimeDays}</output> <small>{t.uptimeDays}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.arcCache}</span>
                <output>{fmtVal(s.arc_size, formatBytes)}</output>
              </div>
              <div className="detail-row">
                <span>{t.cpuTemp}</span>
                <output>{s.cpu_temp}°C</output>
              </div>
            </div>
          </article>

          <article
            className="insight-card hardware"
            aria-labelledby="label-truenas-resources"
          >
            <span
              className="insight-label"
              id="label-truenas-resources"
            >
              {t.resourceLoad}
            </span>
            <div className="insight-value">
              <span className="sr-only">
                {t.cpuUsagePrefix} {fmtVal(s.cpu_usage_avg, formatPercent)} %
              </span>
              <span aria-hidden="true">
                <output>{fmtVal(s.cpu_usage_avg, formatPercent)}</output>{" "}
                <small>{t.percentCPU}</small>
              </span>
            </div>
            <div className="insight-details">
              <div className="detail-row">
                <span>{t.memoryUsage}</span>
                <output>
                  {fmtVal(s.mem_used_percent, formatPercent)}
                  <small aria-hidden="true"> {t.percentRAM}</small>
                </output>
              </div>
              <div className="detail-row">
                <span>{t.loadStatus}</span>
                <output className={getStatusColor(loadStatus)}>
                  {getStatusLabel(loadStatus, t)}
                </output>
              </div>
            </div>
          </article>
        </div>
      </section>
    );
  }

  // Docker view
  if (type === "docker" && stats) {
    const s = stats as DockerStats;

    return (
      <section
        className="infrastructure-section"
        aria-label={t.ariaLabel}
      >
        <div className="insights-grid">
          {s.hosts.map((host) => (
            <article
              key={host.name}
              className="insight-card"
              aria-labelledby={`label-docker-${host.name.toLowerCase()}`}
            >
              <span
                className="insight-label"
                id={`label-docker-${host.name.toLowerCase()}`}
              >
                {host.name}
              </span>
              <div className="insight-value">
                <span className="sr-only">
                  {fmtVal(host.containers_running)} /{" "}
                  {fmtVal(host.containers_total)} {t.containersRunning}
                </span>
                <span aria-hidden="true">
                  <output>
                    {fmtVal(host.containers_running)} /{" "}
                    {fmtVal(host.containers_total)}
                  </output>{" "}
                  <small>{t.containersRunning}</small>
                </span>
              </div>
              <div className="insight-details">
                <div className="detail-row">
                  <span>{t.dockerImages}</span>
                  <output>{fmtVal(host.images)}</output>
                </div>
              </div>
            </article>
          ))}
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
