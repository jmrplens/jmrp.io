import type { ComponentChildren } from "preact";
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

/** Discriminated fetch result to decouple error handling from the fetch logic. */
type FetchResult =
  | { ok: true; data: TorApiResponse }
  | { ok: false; error: string };

/**
 * Format bytes into a human-readable string.
 *
 * @param bytes - The byte count to format.
 * @returns A formatted string (e.g., "1.5 GB").
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
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

/** Cached homelab token read from the DOM once. */
let cachedToken: string | null = null;

/** Reads the homelab token from the DOM, caching it for subsequent calls. */
function getHomelabToken(): string {
  if (cachedToken !== null) return cachedToken;
  cachedToken =
    document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
      .homelabToken ?? "";
  return cachedToken;
}

/** Module-level cached promise so both bridge + relay share a single request. */
let sharedFetchPromise: Promise<FetchResult> | null = null;

/**
 * Validate that the API response has the expected shape.
 *
 * @param data - The parsed JSON from the API.
 * @returns True if the data matches TorApiResponse.
 */
function isValidTorResponse(data: unknown): data is TorApiResponse {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.bridge === "object" &&
    obj.bridge !== null &&
    typeof obj.relay === "object" &&
    obj.relay !== null
  );
}

/**
 * Fetch Tor statistics from the homelab API.
 * Uses a module-level shared promise so concurrent callers reuse the same request.
 *
 * @returns A discriminated result with the API data or an error message.
 */
function fetchTorStats(): Promise<FetchResult> {
  if (sharedFetchPromise) return sharedFetchPromise;

  sharedFetchPromise = (async (): Promise<FetchResult> => {
    try {
      const token = getHomelabToken();
      const headers: HeadersInit = token ? { "X-Homelab-Token": token } : {};

      const res = await fetch("/api/homelab/tor", { headers }).catch(
        () => null,
      );
      if (!res?.ok) {
        return { ok: false, error: `HTTP ${res?.status ?? "network error"}` };
      }

      const json: unknown = await res.json();
      if (!isValidTorResponse(json)) {
        return { ok: false, error: "Invalid API response shape" };
      }

      return { ok: true, data: json };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to fetch Tor stats", error);
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      sharedFetchPromise = null;
    }
  })();

  return sharedFetchPromise;
}

/** Returns the display text for a Tor node's running status. */
function getStatusText(
  data: TorNodeData | null,
  t: TorStatsTranslations,
): string {
  if (!data) return "...";
  return data.running ? t.running : t.offline;
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

/** A single metric cell (label + value). */
function TorMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="tor-metric">
      <span className="tor-metric-label">{label}</span>
      <strong className="tor-metric-value">{value}</strong>
    </div>
  );
}

/**
 * Shared layout for both Bridge and Relay cards.
 * Renders the common status header, flags, traffic section, and a slot
 * for type-specific metrics, eliminating markup duplication.
 */
function TorNodeCard({
  data,
  translations: t,
  children,
}: {
  readonly data: TorNodeData | null;
  readonly translations: TorStatsTranslations;
  readonly children: ComponentChildren;
}) {
  const isOffline = data !== null && !data.running;

  return (
    <div className="stats-wrapper-col">
      {/* Status + Version */}
      <div className="status-header">
        <div
          className={`status-badge${isOffline ? " status-badge--offline" : ""}`}
        >
          <span
            className={`status-dot${isOffline ? " status-dot--offline" : ""}`}
          ></span>
          <strong>{getStatusText(data, t)}</strong>
        </div>
        {data ? (
          <div className="status-text-muted">
            <strong className="status-text">Tor {data.version}</strong>{" "}
            <span
              className={`tor-version-badge ${data.recommended_version ? "tor-version-badge--ok" : "tor-version-badge--warn"}`}
            >
              {data.recommended_version
                ? `✓ ${t.recommended}`
                : `⚠ ${t.obsolete}`}
            </span>
          </div>
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
          <TorMetric
            label={t.download}
            value={data ? formatBytes(data.traffic_read_24h) : "..."}
          />
          <TorMetric
            label={t.upload}
            value={data ? formatBytes(data.traffic_write_24h) : "..."}
          />
        </div>
      </div>

      {/* Type-specific metrics */}
      {children}
    </div>
  );
}

/**
 * Displays live Tor statistics for a bridge or relay node.
 * Fetches data from /api/homelab/tor and renders the appropriate card layout.
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

    const load = async () => {
      const result = await fetchTorStats();
      if (result.ok) {
        setData(type === "bridge" ? result.data.bridge : result.data.relay);
      } else {
        setError(true);
      }
    };

    void load();
  }, [type]);

  if (error) {
    return <div className="stats-error">{t.serviceUnavailable}</div>;
  }

  return (
    <TorNodeCard
      data={data}
      translations={t}
    >
      {type === "bridge" ? (
        <>
          {data?.transports ? (
            <TorFlagList
              flags={data.transports}
              label={t.transports}
              badgeClass="tor-transport-badge"
            />
          ) : null}
          <div className="tor-metric-grid">
            <TorMetric
              label={t.clients24h}
              value={data?.clients_24h?.toLocaleString() ?? "..."}
            />
            <TorMetric
              label={t.advertisedBandwidth}
              value={data ? formatBandwidth(data.advertised_bandwidth) : "..."}
            />
          </div>
        </>
      ) : (
        <>
          <div className="tor-metric-grid">
            <TorMetric
              label={t.orConnections}
              value={data?.or_connections?.toLocaleString() ?? "..."}
            />
            <TorMetric
              label={t.circuits}
              value={data?.circuits_open?.toLocaleString() ?? "..."}
            />
          </div>
          <div className="tor-metric-grid">
            <TorMetric
              label={t.connections24h}
              value={data?.connections_24h?.toLocaleString() ?? "..."}
            />
            <TorMetric
              label={t.location}
              value={data?.location ?? "..."}
            />
          </div>
        </>
      )}
    </TorNodeCard>
  );
}
