import { useEffect, useState } from "preact/hooks";

/** Translations required by TorStats. Passed from Astro parent. */
export interface TorStatsTranslations {
  /** Label shown when the Tor API is unavailable. */
  serviceUnavailable: string;
  /** Status text displayed when the node is running. */
  running: string;
  /** Status text displayed when the node is offline. */
  offline: string;
  /** Label for Tor version display. */
  version: string;
  /** Badge text when version is recommended. */
  recommended: string;
  /** Badge text when version is obsolete. */
  obsolete: string;
  /** Label for consensus flags. */
  flags: string;
  /** Label for pluggable transports (bridge only). */
  transports: string;
  /** Label for traffic section. */
  traffic24h: string;
  /** Download arrow label. */
  download: string;
  /** Upload arrow label. */
  upload: string;
  /** Label for client connections (bridge). */
  clients24h: string;
  /** Label for OR connections (relay). */
  orConnections: string;
  /** Label for open circuits. */
  circuits: string;
  /** Label for peer connections 24h (relay). */
  connections24h: string;
  /** Label for advertised bandwidth. */
  advertisedBandwidth: string;
  /** Location label. */
  location: string;
}

/** Props for TorStats component */
interface Props {
  readonly type: "bridge" | "relay";
  readonly translations: TorStatsTranslations;
}

/** Tor node data from the API */
interface TorNodeData {
  running: boolean;
  version: string;
  version_status: string;
  recommended_version: boolean;
  flags: string[];
  transports?: string[];
  traffic_read_24h: number;
  traffic_write_24h: number;
  or_connections: number;
  circuits_open: number;
  advertised_bandwidth: number;
  clients_24h?: number;
  connections_24h?: number;
  last_seen: string;
  location: string;
  type: string;
  num_flags: number;
  num_transports?: number;
}

/** Full API response */
interface TorApiResponse {
  bridge: TorNodeData;
  relay: TorNodeData;
}

/**
 * Format bytes into a human-readable string.
 *
 * @param bytes - The byte count to format.
 * @returns A formatted string (e.g., "1.5 GB").
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format bandwidth (bytes/s) into a human-readable string.
 *
 * @param bps - Bytes per second.
 * @returns A formatted string (e.g., "2.0 MB/s").
 */
function formatBandwidth(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

/**
 * Fetch Tor statistics from the homelab API.
 *
 * @param setError - Callback to signal an error state.
 * @returns The full Tor API response or null on failure.
 */
async function fetchTorStats(
  setError: (error: boolean) => void,
): Promise<TorApiResponse | null> {
  try {
    const token =
      document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
        .homelabToken ?? "";
    const headers: HeadersInit = token ? { "X-Homelab-Token": token } : {};

    const res = await fetch("/api/homelab/tor", { headers }).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return null;
    }

    return (await res.json()) as TorApiResponse;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Tor stats", error);
    }
    setError(true);
    return null;
  }
}

/** Returns the display text for a Tor node's running status. */
function getStatusText(
  data: TorNodeData | null,
  t: TorStatsTranslations,
): string {
  if (!data) return "...";
  return data.running ? t.running : t.offline;
}

/** Renders the version info block for a Tor node. */
function TorVersionInfo({
  data,
  translations: t,
}: {
  readonly data: TorNodeData;
  readonly translations: TorStatsTranslations;
}) {
  return (
    <div className="status-text-muted">
      <strong className="status-text">Tor {data.version}</strong>{" "}
      <span
        className={`tor-version-badge ${data.recommended_version ? "tor-version-badge--ok" : "tor-version-badge--warn"}`}
      >
        {data.recommended_version ? `✓ ${t.recommended}` : `⚠ ${t.obsolete}`}
      </span>
    </div>
  );
}

/** Renders the flag badges for a Tor node. Returns empty fragment if no flags. */
function TorFlagList({
  flags,
  label,
  badgeClass = "tor-flag-badge",
}: {
  readonly flags: readonly string[];
  readonly label: string;
  readonly badgeClass?: string;
}) {
  if (flags.length === 0) return <></>;
  return (
    <div className="tor-flags">
      <span className="tor-flags-label">{label}:</span>
      <div className="tor-flags-list">
        {flags.map((flag) => (
          <span
            key={flag}
            className={badgeClass}
          >
            {flag}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Renders the Tor Bridge service card stats.
 *
 * @param props - Component properties.
 * @param props.data - Bridge node data from the API.
 * @param props.translations - Translated strings.
 */
function BridgeStats({
  data,
  translations: t,
}: {
  readonly data: TorNodeData | null;
  readonly translations: TorStatsTranslations;
}) {
  return (
    <div className="stats-wrapper-col">
      {/* Status + Version */}
      <div className="status-header">
        <div
          className={`status-badge${data && !data.running ? " status-badge--offline" : ""}`}
        >
          <span
            className={`status-dot${data && !data.running ? " status-dot--offline" : ""}`}
          ></span>
          <strong>{getStatusText(data, t)}</strong>
        </div>
        {data ? (
          <TorVersionInfo
            data={data}
            translations={t}
          />
        ) : null}
      </div>

      {data ? (
        <TorFlagList
          flags={data.flags}
          label={t.flags}
        />
      ) : null}

      {data?.transports ? (
        <TorFlagList
          flags={data.transports}
          label={t.transports}
          badgeClass="tor-transport-badge"
        />
      ) : null}

      {/* Traffic 24h */}
      <div className="tor-metrics">
        <div className="tor-metric-header">{t.traffic24h}</div>
        <div className="tor-metric-grid">
          <div className="tor-metric">
            <span className="tor-metric-label">{t.download}</span>
            <strong className="tor-metric-value">
              {data ? formatBytes(data.traffic_read_24h) : "..."}
            </strong>
          </div>
          <div className="tor-metric">
            <span className="tor-metric-label">{t.upload}</span>
            <strong className="tor-metric-value">
              {data ? formatBytes(data.traffic_write_24h) : "..."}
            </strong>
          </div>
        </div>
      </div>

      {/* Bridge-specific stats */}
      <div className="tor-metric-grid">
        <div className="tor-metric">
          <span className="tor-metric-label">{t.clients24h}</span>
          <strong className="tor-metric-value">
            {data?.clients_24h?.toLocaleString() ?? "..."}
          </strong>
        </div>
        <div className="tor-metric">
          <span className="tor-metric-label">{t.advertisedBandwidth}</span>
          <strong className="tor-metric-value">
            {data ? formatBandwidth(data.advertised_bandwidth) : "..."}
          </strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the Tor Relay service card stats.
 *
 * @param props - Component properties.
 * @param props.data - Relay node data from the API.
 * @param props.translations - Translated strings.
 */
function RelayStats({
  data,
  translations: t,
}: {
  readonly data: TorNodeData | null;
  readonly translations: TorStatsTranslations;
}) {
  return (
    <div className="stats-wrapper-col">
      {/* Status + Version */}
      <div className="status-header">
        <div
          className={`status-badge${data && !data.running ? " status-badge--offline" : ""}`}
        >
          <span
            className={`status-dot${data && !data.running ? " status-dot--offline" : ""}`}
          ></span>
          <strong>{getStatusText(data, t)}</strong>
        </div>
        {data ? (
          <TorVersionInfo
            data={data}
            translations={t}
          />
        ) : null}
      </div>

      {data ? (
        <TorFlagList
          flags={data.flags}
          label={t.flags}
        />
      ) : null}

      {/* Traffic 24h */}
      <div className="tor-metrics">
        <div className="tor-metric-header">{t.traffic24h}</div>
        <div className="tor-metric-grid">
          <div className="tor-metric">
            <span className="tor-metric-label">{t.download}</span>
            <strong className="tor-metric-value">
              {data ? formatBytes(data.traffic_read_24h) : "..."}
            </strong>
          </div>
          <div className="tor-metric">
            <span className="tor-metric-label">{t.upload}</span>
            <strong className="tor-metric-value">
              {data ? formatBytes(data.traffic_write_24h) : "..."}
            </strong>
          </div>
        </div>
      </div>

      {/* Relay-specific stats */}
      <div className="tor-metric-grid">
        <div className="tor-metric">
          <span className="tor-metric-label">{t.orConnections}</span>
          <strong className="tor-metric-value">
            {data?.or_connections?.toLocaleString() ?? "..."}
          </strong>
        </div>
        <div className="tor-metric">
          <span className="tor-metric-label">{t.circuits}</span>
          <strong className="tor-metric-value">
            {data?.circuits_open?.toLocaleString() ?? "..."}
          </strong>
        </div>
      </div>
      <div className="tor-metric-grid">
        <div className="tor-metric">
          <span className="tor-metric-label">{t.connections24h}</span>
          <strong className="tor-metric-value">
            {data?.connections_24h?.toLocaleString() ?? "..."}
          </strong>
        </div>
      </div>
    </div>
  );
}

/**
 * Displays live Tor statistics for a bridge or relay node.
 * Fetches data from /api/homelab/tor and renders the appropriate sub-component.
 *
 * @param props - Component properties.
 * @param props.type - The node type: "bridge" or "relay".
 * @param props.translations - Translated strings for the component.
 * @returns The rendered stats component.
 */
export default function TorStats({ type, translations: t }: Props) {
  const [data, setData] = useState<TorNodeData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);

    const fetchData = async () => {
      const response = await fetchTorStats(setError);
      if (response) {
        setData(type === "bridge" ? response.bridge : response.relay);
      }
    };

    void fetchData();
  }, [type]);

  if (error) {
    return <div className="stats-error">{t.serviceUnavailable}</div>;
  }

  return type === "bridge" ? (
    <BridgeStats
      data={data}
      translations={t}
    />
  ) : (
    <RelayStats
      data={data}
      translations={t}
    />
  );
}
