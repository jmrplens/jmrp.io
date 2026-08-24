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
}

/** Component props. */
interface Props {
  readonly translations: HomelabKpiTranslations;
  /** Total number of public services rendered on the page (the denominator). */
  readonly servicesCount: number;
  /** Number of monitored infrastructure nodes (computed at build). */
  readonly nodesCount: number;
  /**
   * Pre-formatted display strings: the `HLM_*` tokens from `ssr-tokens.ts`,
   * replaced by nginx at serve time. The component renders them verbatim and
   * fetches nothing; it is mounted WITHOUT a `client:*` directive. See
   * `ssr-tokens.ts` for the full contract.
   */
  readonly ssr: {
    readonly online: string;
    readonly requests: string;
    readonly wan: string;
  };
}

/**
 * Homelab KPI band — four headline figures above the edge-defense spotlight.
 * Two are structural (services total, nodes) and two arrive pre-formatted from
 * nginx as `HLM_*` tokens. The component fetches nothing: it renders on the
 * server and never hydrates.
 */
export default function HomelabKpi({
  translations: t,
  servicesCount,
  nodesCount,
  ssr,
}: Props) {
  // Server-injected values are already formatted; render them verbatim.
  const kpis = [
    {
      v: `${ssr.online} / ${servicesCount}`,
      l: t.servicesOnline,
      empty: false,
    },
    { v: String(nodesCount), l: t.monitoredNodes, empty: false },
    { v: ssr.requests, l: t.requests24h, empty: false },
    { v: ssr.wan, l: t.wan24h, empty: false },
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
