import { useEffect, useState } from "preact/hooks";

/** Translations for the Tor aggregate band. Passed from the Astro parent. */
export interface TorAggregateTranslations {
  /** Label for the number of monitored nodes. */
  nodes: string;
  /** Label for the total clients helped (24h). */
  clients: string;
  /** Label for the total advertised bandwidth. */
  bandwidth: string;
  /** Label for the total relayed traffic (24h). */
  traffic: string;
}

/** Props for TorAggregate. */
interface Props {
  readonly translations: TorAggregateTranslations;
}

/** Per-node fields the aggregate band reads (subset of the Tor API node). */
interface TorNode {
  clients_24h?: number;
}

/** The aggregate fields of the Tor API response used by this band. */
interface TorAggregateData {
  total_traffic_bps: number;
  total_traffic_read_24h: number;
  total_traffic_write_24h: number;
  nodes_count: number;
  bridge?: TorNode;
  bridge_es1?: TorNode;
  relay?: TorNode;
  relay_es?: TorNode;
}

/** Formats a byte count into a compact human-readable string. */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value < 10 ? 2 : 0)} ${units[i]}`;
}

/** Validates the aggregate shape (best-effort). */
function isValidAggregate(data: unknown): data is TorAggregateData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.total_traffic_bps === "number";
}

/**
 * Tor network aggregate band: monitored nodes, total clients helped, advertised
 * bandwidth and relayed traffic. Reads the same /api/homelab/tor endpoint the
 * per-node cards use (server-side cached, so this is deduped).
 *
 * @param props - Component properties including translations.
 * @returns The rendered aggregate band.
 */
export default function TorAggregate({ translations: t }: Props) {
  const [data, setData] = useState<TorAggregateData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const res = await fetch("/api/homelab/tor", {
          signal: controller.signal,
          headers: { "X-Homelab-Token": token },
        });
        if (res.ok) {
          const json = (await res.json()) as unknown;
          if (isValidAggregate(json)) setData(json);
        }
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Failed to fetch Tor aggregate", error);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  const num = (v: number | undefined) =>
    v === undefined ? "..." : v.toLocaleString();

  const totalClients =
    data === null
      ? undefined
      : (data.bridge?.clients_24h ?? 0) +
        (data.bridge_es1?.clients_24h ?? 0) +
        (data.relay?.clients_24h ?? 0) +
        (data.relay_es?.clients_24h ?? 0);

  const totalTraffic =
    data === null
      ? undefined
      : data.total_traffic_read_24h + data.total_traffic_write_24h;

  return (
    <div className="tor-aggregate">
      <div className="tor-agg-item">
        <span className="tor-agg-value">{num(data?.nodes_count)}</span>
        <span className="tor-agg-label">{t.nodes}</span>
      </div>
      <div className="tor-agg-item">
        <span className="tor-agg-value">{num(totalClients)}</span>
        <span className="tor-agg-label">{t.clients}</span>
      </div>
      <div className="tor-agg-item">
        <span className="tor-agg-value">
          {data ? `${formatBytes(data.total_traffic_bps)}/s` : "..."}
        </span>
        <span className="tor-agg-label">{t.bandwidth}</span>
      </div>
      <div className="tor-agg-item">
        <span className="tor-agg-value">
          {totalTraffic === undefined ? "..." : formatBytes(totalTraffic)}
        </span>
        <span className="tor-agg-label">{t.traffic}</span>
      </div>
    </div>
  );
}
