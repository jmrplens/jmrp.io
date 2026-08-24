/** Translations required by NodeCards. Passed from the Astro parent. */
export interface NodeCardsTranslations {
  /** ARIA label for the node grid region. */
  ariaLabel: string;
  /** Label for the CPU usage row. */
  cpu: string;
  /** Label for the RAM usage row. */
  ram: string;
  /** Temperature label when the node is under normal load. */
  tempOptimal: string;
  /** Temperature label when the node is under high load. */
  tempHighLoad: string;
  /** Status pill text when the node is under normal load. */
  statusOptimal: string;
  /** Status pill text when the node is under high load. */
  statusHighLoad: string;
  /** Shown in place of a metric when its live value is unavailable. */
  noData: string;
}

/** Static per-node configuration (name, role). */
export interface NodeConfig {
  /** Stable key for the React list. */
  key: string;
  /** Display name (e.g. "NGINX Edge"). */
  name: string;
  /** Mono sub-label describing the node's role. */
  role: string;
}

/** Per-node server-injected display strings. Mirrors `NodeSsr` in `ssr-tokens.ts`. */
export interface NodeSsrValues {
  /** CPU usage, pre-formatted (e.g. "6.4%"). */
  readonly cpu: string;
  /** RAM usage, pre-formatted. */
  readonly mem: string;
  /** CPU temperature, pre-formatted (e.g. "44°C"). */
  readonly temp: string;
  /** Localized status-pill text, computed against the high-load threshold by nginx. */
  readonly status: string;
  /** Localized temperature label, computed the same way. */
  readonly tempLabel: string;
  /** CSS class(es) for the CPU meter fill width (see ssr-tokens.ts). */
  readonly cpuBar: string;
  /** CSS class(es) for the RAM meter fill width. */
  readonly memBar: string;
  /** Status-pill class, threshold-aware, injected by nginx (see ssr-tokens.ts). */
  readonly statusClass: string;
  /** Status-pill icon class, injected the same way. */
  readonly statusIcon: string;
}

/** Component props. */
interface Props {
  readonly translations: NodeCardsTranslations;
  readonly nodes: readonly NodeConfig[];
  /**
   * Server-injected mode: per-node pre-formatted display strings keyed by
   * `NodeConfig.key` (the `HLM_*` tokens from `ssr-tokens.ts`, replaced by
   * nginx at serve time). The component renders them verbatim, fetches
   * nothing, and is mounted WITHOUT a `client:*` directive. The meter-bar widths are driven by stepped `.hlm-w*` CSS
   * classes (injected by nginx like every other token) rather than inline
   * styles, which the page CSP blocks.
   */
  readonly ssr: Readonly<Record<string, NodeSsrValues>>;
}

/**
 * Compact infrastructure node grid — one card per monitored node showing live
 * CPU / RAM / temperature. Every figure — including the meter widths and the
 * status pill — arrives pre-formatted from nginx as an `HLM_*` token, so the
 * component fetches nothing and never hydrates.
 */
export default function NodeCards({ translations: t, nodes, ssr }: Props) {
  // Values verbatim, bars unfilled (see the `ssr` prop doc), pill/labels
  // pre-localized by nginx.
  return (
    <div className="node-grid">
      {nodes.map((node) => {
        const v = ssr[node.key];
        const meters = [
          { label: t.cpu, value: v?.cpu ?? t.noData, bar: v?.cpuBar ?? "" },
          { label: t.ram, value: v?.mem ?? t.noData, bar: v?.memBar ?? "" },
        ];
        return (
          <article
            key={node.key}
            className="node-card"
          >
            <header className="node-card__head">
              <div className="node-card__id">
                <h3 className="node-card__name">{node.name}</h3>
                <p className="node-card__role">{node.role}</p>
              </div>
              {/* Class and icon are injected tokens, so the pill's color
                    and shape stay coherent with the injected "High load" /
                    "Optimal" text — the component itself cannot compute them
                    at build time. */}
              <span
                className={`node-card__status ${v?.statusClass ?? "node-card__status--ok"}`}
              >
                <span
                  className={v?.statusIcon ?? "node-card__dot"}
                  aria-hidden="true"
                />
                {v?.status ?? t.statusOptimal}
              </span>
            </header>

            <div className="node-card__meters">
              {meters.map((m) => (
                <div
                  className="node-meter"
                  key={m.label}
                >
                  <div className="node-meter__head">
                    <span className="node-meter__label">{m.label}</span>
                    <span className="node-meter__value">{m.value}</span>
                  </div>
                  <div className="node-meter__track">
                    <div className={`node-meter__fill ${m.bar}`} />
                  </div>
                </div>
              ))}

              <div className="node-card__temp">
                <span className="node-meter__label">
                  {v?.tempLabel ?? t.tempOptimal}
                </span>
                <span className="node-card__temp-value">
                  {v?.temp ?? t.noData}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
