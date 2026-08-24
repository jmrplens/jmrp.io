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
  /**
   * Server-injected mode: pre-formatted display strings (the `HLM_*` tokens
   * from `ssr-tokens.ts`, replaced by nginx at serve time) plus the static
   * node count, which is known at build time from the page's own node list.
   * The component renders them verbatim, fetches nothing, and is mounted
   * WITHOUT a `client:*` directive.
   */
  readonly ssr: {
    readonly nodesCount: number;
    readonly clients: string;
    readonly bandwidth: string;
    readonly traffic: string;
  };
}

/**
 * Tor network aggregate band: monitored nodes, total clients helped, advertised
 * bandwidth and relayed traffic. Values arrive pre-formatted from nginx as
 * `HLM_*` tokens; the component fetches nothing and never hydrates.
 *
 * @param props - Component properties including translations.
 * @returns The rendered aggregate band.
 */
export default function TorAggregate({ translations: t, ssr }: Props) {
  const items = [
    { value: String(ssr.nodesCount), label: t.nodes },
    { value: ssr.clients, label: t.clients },
    { value: ssr.bandwidth, label: t.bandwidth },
    { value: ssr.traffic, label: t.traffic },
  ];
  return (
    <div className="tor-aggregate">
      {items.map((item) => (
        <div
          className="tor-agg-item"
          key={item.label}
        >
          <span className="tor-agg-value">{item.value}</span>
          <span className="tor-agg-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
