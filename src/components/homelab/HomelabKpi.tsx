import { useEffect, useRef, useState } from "preact/hooks";

/** Translations required by HomelabKpi. Passed from the Astro parent. */
export interface HomelabKpiTranslations {
  /** ARIA label for the KPI band region. */
  ariaLabel: string;
  /** Label under the "services online" figure. */
  servicesOnline: string;
  /** Label under the "monitored nodes" figure. */
  monitoredNodes: string;
  /** Label under the "requests · 24h" figure. */
  requests24h: string;
  /** Label under the "WAN · 24h" figure. */
  wan24h: string;
  /** Shown in place of a figure when its live value is unavailable. */
  noData: string;
}

/** Component props. */
interface Props {
  readonly translations: HomelabKpiTranslations;
  /** Total number of public services rendered on the page (the denominator). */
  readonly servicesCount: number;
  /** Number of monitored infrastructure nodes (computed at build). */
  readonly nodesCount: number;
}

/** Health endpoint payload: real per-service up/down aggregated server-side. */
interface HealthPayload {
  online: number;
  total: number;
}

/** Subset of the stats payload used for the KPI band (requests + WAN 24h). */
interface StatsPayload {
  requests_received_24h: number;
  wan_rx_bytes_24h: number;
}

/** Narrow an unknown payload to the health shape. */
function isHealth(data: unknown): data is HealthPayload {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d.online === "number" && typeof d.total === "number";
}

/** Narrow an unknown payload to the stats fields we read. */
function isStats(data: unknown): data is StatsPayload {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.requests_received_24h === "number" &&
    typeof d.wan_rx_bytes_24h === "number"
  );
}

/**
 * Formats a byte count into a compact human-readable string (e.g. "485 GB").
 * @param bytes - The number of bytes.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  );
  const value = bytes / Math.pow(k, i);
  return `${Number.parseFloat(value.toFixed(value < 10 ? 1 : 0))} ${sizes[i]}`;
}

/**
 * Homelab KPI band — four headline figures above the edge-defense spotlight.
 * Two are structural (services total, nodes) and two are live: the real online
 * count comes from the server-side `/api/homelab/health` aggregate, while the
 * 24h requests + WAN figures piggyback on the `/api/homelab/stats` payload the
 * band already fetches — so the whole band costs two cached requests. A failed
 * fetch leaves the affected figure as an em dash.
 */
export default function HomelabKpi({
  translations: t,
  servicesCount,
  nodesCount,
}: Props) {
  const [online, setOnline] = useState<number | null>(null);
  const [requests, setRequests] = useState<number | null>(null);
  const [wan, setWan] = useState<number | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const REFRESH_INTERVAL = 30_000;

    const fetchKpis = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const headers = { "X-Homelab-Token": token };
        const [healthRes, statsRes] = await Promise.all([
          fetch("/api/homelab/health", {
            signal: controller.signal,
            headers,
          }).catch(() => null),
          fetch("/api/homelab/stats", {
            signal: controller.signal,
            headers,
          }).catch(() => null),
        ]);

        if (healthRes?.ok) {
          const health = (await healthRes.json()) as unknown;
          if (isHealth(health)) setOnline(health.online);
        }
        if (statsRes?.ok) {
          const stats = (await statsRes.json()) as unknown;
          if (isStats(stats)) {
            setRequests(stats.requests_received_24h);
            setWan(stats.wan_rx_bytes_24h);
          }
        }
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch homelab KPI stats", error);
      } finally {
        isFetchingRef.current = false;
      }
    };

    void fetchKpis();
    const intervalId = setInterval(() => void fetchKpis(), REFRESH_INTERVAL);
    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  const kpis = [
    {
      v: `${online === null ? "…" : online} / ${servicesCount}`,
      l: t.servicesOnline,
      empty: online === null,
    },
    { v: String(nodesCount), l: t.monitoredNodes, empty: false },
    {
      v: requests === null ? t.noData : requests.toLocaleString(),
      l: t.requests24h,
      empty: requests === null,
    },
    {
      v: wan === null ? t.noData : formatBytes(wan),
      l: t.wan24h,
      empty: wan === null,
    },
  ];

  return (
    <div className="kpi-band">
      {kpis.map((k) => (
        <div
          key={k.l}
          className="kpi-card"
        >
          <p
            className={
              k.empty
                ? "kpi-card__value kpi-card__value--empty"
                : "kpi-card__value"
            }
          >
            {k.v}
          </p>
          <p className="kpi-card__label">{k.l}</p>
        </div>
      ))}
    </div>
  );
}
