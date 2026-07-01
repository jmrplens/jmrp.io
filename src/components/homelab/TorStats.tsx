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
  /** The node type: `"bridge"` (obfs4/WebTunnel, UK), `"bridge-es1"` (obfs4/WebTunnel, ES), `"relay"` (UK middle relay), or `"relay-es"` (ES middle relay). */
  readonly type: TorType;
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

/** The valid node type values for TorStats. */
export type TorType = "bridge" | "bridge-es1" | "relay" | "relay-es";

/** Full API response */
interface TorApiResponse {
  bridge: TorNodeData;
  bridge_es1?: TorNodeData;
  relay: TorNodeData;
  relay_es?: TorNodeData;
}

/** Discriminated fetch result to decouple error handling from the fetch logic. */
type FetchResult =
  { ok: true; data: TorApiResponse } | { ok: false; error: string };

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
  if (sharedFetchPromise !== null) return sharedFetchPromise;

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

/**
 * Compact Tor node card (matches the mockup): status pill + one headline figure
 * (clients/connections · 24h) + location + advertised bandwidth. The full
 * "Tor Metrics" link is provided by the surrounding ServiceCard.
 */
function TorNodeCard({
  data,
  translations: t,
  headlineLabel,
  headlineValue,
}: {
  readonly data: TorNodeData | null;
  readonly translations: TorStatsTranslations;
  readonly headlineLabel: string;
  readonly headlineValue: string;
}) {
  const isOffline = data !== null && !data.running;
  const bandwidth =
    data?.advertised_bandwidth == null
      ? "..."
      : formatBandwidth(data.advertised_bandwidth);
  return (
    <div className="tor-node">
      <span
        className={`tor-node__status${isOffline ? " tor-node__status--off" : ""}`}
      >
        <span
          className="tor-node__dot"
          aria-hidden="true"
        ></span>
        {getStatusText(data, t)}
      </span>
      <p className="tor-node__headline">
        <output className="tor-node__num">{headlineValue}</output>
        <span className="tor-node__label">{headlineLabel}</span>
      </p>
      <div className="tor-node__rows">
        <div className="tor-node__row">
          <span className="tor-node__k">{t.location}</span>
          <span className="tor-node__v">{data?.location ?? "..."}</span>
        </div>
        <div className="tor-node__row">
          <span className="tor-node__k">{t.advertisedBandwidth}</span>
          <span className="tor-node__v">{bandwidth}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Live Tor node stats as a compact card. Bridges show clients helped (24h);
 * relays show connections (24h). Data comes from /api/homelab/tor.
 *
 * @param props - Component properties.
 * @param props.type - Node type: bridge, bridge-es1, relay or relay-es.
 * @param props.translations - Translated strings for the component.
 * @returns The rendered compact Tor node card.
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
        const dataMap: Record<TorType, TorNodeData | undefined> = {
          bridge: result.data.bridge,
          "bridge-es1": result.data.bridge_es1,
          relay: result.data.relay,
          "relay-es": result.data.relay_es,
        };
        setData(dataMap[type] ?? null);
      } else {
        setError(true);
      }
    };

    void load();
  }, [type]);

  if (error) {
    return <div className="stats-error">{t.serviceUnavailable}</div>;
  }

  const isBridge = type === "bridge" || type === "bridge-es1";
  const headlineValue = isBridge
    ? (data?.clients_24h?.toLocaleString() ?? "...")
    : (data?.connections_24h?.toLocaleString() ?? "...");
  const headlineLabel = isBridge ? t.clients24h : t.connections24h;

  return (
    <TorNodeCard
      data={data}
      translations={t}
      headlineLabel={headlineLabel}
      headlineValue={headlineValue}
    />
  );
}
