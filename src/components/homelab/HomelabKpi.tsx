import { useEffect, useRef, useState } from "preact/hooks";

/** Translations required by HomelabKpi. Passed from the Astro parent. */
export interface HomelabKpiTranslations {
  /** ARIA label for the KPI band region. */
  ariaLabel: string;
  /** Label under the "services online" figure. */
  servicesOnline: string;
  /** Label under the "monitored nodes" figure. */
  monitoredNodes: string;
  /** Label under the "threats blocked (24h)" figure. */
  threatsBlocked: string;
  /** Label under the "uptime (24h)" figure. */
  uptime: string;
}

/** Component props. */
interface Props {
  readonly translations: HomelabKpiTranslations;
  /** Number of public services rendered on the page (e.g. 3). */
  readonly servicesCount: number;
  /** Number of monitored infrastructure nodes (computed at build). */
  readonly nodesCount: number;
  /** Stated availability figure — a headline flourish, not a live probe. */
  readonly uptimeValue: string;
}

/**
 * Subset of the stats payload used for the "threats blocked · 24h" headline.
 * Only genuine 24h counters are summed — the MikroTik honeypot/blacklist/
 * CrowdSec figures are cumulative totals, so mixing them in would break the
 * "· 24h" label.
 */
interface StatsSubset {
  tarpit_hits_24h: number;
  nginx_bans_24h: number;
}

/** Narrow an unknown payload to the numeric fields we sum. */
function pickNumbers<T>(
  data: unknown,
  keys: readonly (keyof T & string)[],
): T | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (keys.some((k) => typeof d[k] !== "number")) return null;
  return d as T;
}

/**
 * Homelab KPI band — the four headline figures above the edge-defense
 * spotlight. Three figures are structural (services, nodes, uptime) and passed
 * as props; the "threats blocked" figure is fetched live so the "vía API" claim
 * holds. A fetch failure simply leaves that one figure as an em dash.
 */
export default function HomelabKpi({
  translations: t,
  servicesCount,
  nodesCount,
  uptimeValue,
}: Props) {
  const [threats, setThreats] = useState<number | null>(null);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const REFRESH_INTERVAL = 30_000;

    const fetchThreats = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const headers = { "X-Homelab-Token": token };
        const statsRes = await fetch("/api/homelab/stats", {
          signal: controller.signal,
          headers,
        });
        if (!statsRes.ok) return;
        const stats = pickNumbers<StatsSubset>(await statsRes.json(), [
          "tarpit_hits_24h",
          "nginx_bans_24h",
        ]);
        if (!stats) return;
        setThreats(stats.tarpit_hits_24h + stats.nginx_bans_24h);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch homelab KPI stats", error);
      } finally {
        isFetchingRef.current = false;
      }
    };

    void fetchThreats();
    const intervalId = setInterval(() => void fetchThreats(), REFRESH_INTERVAL);
    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  const kpis = [
    { v: `${servicesCount} / ${servicesCount}`, l: t.servicesOnline },
    { v: String(nodesCount), l: t.monitoredNodes },
    {
      v: threats === null ? "—" : threats.toLocaleString(),
      l: t.threatsBlocked,
    },
    { v: uptimeValue, l: t.uptime },
  ];

  return (
    <div className="kpi-band">
      {kpis.map((k) => (
        <div
          key={k.l}
          className="kpi-card"
        >
          <p className="kpi-card__value">{k.v}</p>
          <p className="kpi-card__label">{k.l}</p>
        </div>
      ))}
    </div>
  );
}
