import type { ComponentChildren } from "preact";

/** Translations required by HomelabKpi. Passed from the Astro parent. */
export interface HomelabKpiTranslations {
  /** ARIA label for the KPI band region. */
  ariaLabel: string;
  /** Label under the "services online" figure. */
  servicesOnline: string;
  /** Label under the "active connections" figure. */
  activeConnections: string;
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

  /**
   * Pre-formatted display strings: the `HLM_*` tokens from `ssr-tokens.ts`,
   * replaced by nginx at serve time. The component renders them verbatim and
   * fetches nothing; it is mounted WITHOUT a `client:*` directive. See
   * `ssr-tokens.ts` for the full contract.
   */
  readonly ssr: {
    readonly online: string;
    readonly activeConnections: string;
    readonly requests: string;
    readonly wan: string;
    readonly wanUp: string;
  };
}

/**
 * Homelab KPI band — four headline figures above the edge-defense spotlight.
 * Only the services denominator is structural; the rest arrive pre-formatted
 * from nginx as `HLM_*` tokens. The component fetches nothing: it renders on
 * the server and never hydrates.
 */
export default function HomelabKpi({
  translations: t,
  servicesCount,
  ssr,
}: Props) {
  // Server-injected values are already formatted; render them verbatim.
  const kpis: { v: ComponentChildren; l: string; empty: boolean }[] = [
    {
      v: `${ssr.online} / ${servicesCount}`,
      l: t.servicesOnline,
      empty: false,
    },
    { v: ssr.activeConnections, l: t.activeConnections, empty: false },
    { v: ssr.requests, l: t.requests24h, empty: false },
    // Up over down, one line each: the two directions in one card instead of
    // the node count that used to sit here, and the upload was missing from
    // the page entirely. Arrows carry the direction, so the lines need no words.
    {
      v: (
        <>
          <span className="kpi-card__line">{`\u{2191} ${ssr.wanUp}`}</span>
          <span className="kpi-card__line">{`\u{2193} ${ssr.wan}`}</span>
        </>
      ),
      l: t.wan24h,
      empty: false,
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
