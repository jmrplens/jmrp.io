/** Translations required by InfrastructureInsights. Passed from Astro parent. */
export interface InfrastructureTranslations {
  /** ARIA label for the infrastructure insights container. */
  ariaLabel: string;
  /** Error message shown when data fetching fails. */
  error: string;
  /** Heading for the requests received metric. */
  requestsReceived: string;
  /** Screen-reader-only label for the requests received value. */
  requestsReceivedSR: string;
  /** Label indicating how many requests were handled. */
  handled: string;
  /** Heading for the responses sent metric. */
  responsesSent: string;
  /** Label for upstream proxy responses. */
  upstream: string;
  /** Prefix text before the upload bandwidth value. */
  sentPrefix: string;
  /** Label for the upload bandwidth metric. */
  bandwidthUp: string;
  /** Prefix text before the download bandwidth value. */
  receivedPrefix: string;
  /** Label for the download bandwidth metric. */
  bandwidthDown: string;
  /** Heading for the security blocks section. */
  securityBlocks: string;
  /** Text shown while data is loading. */
  loading: string;
  /** Shown in place of a value when it is unavailable (e.g. API failed). */
  noData: string;
  /** Label for the total security blocks count. */
  totalSecurityBlocks: string;
  /** Unit label for block counts. */
  blocks: string;
  /** Label for the Nginx ban count. */
  nginxBans: string;
  /**
   * Extra descriptive text composed after the visible link text to build an
   * `aria-label` for the tarpit blog post link (WCAG 2.5.3 Label in Name:
   * the visible text must remain the start of the accessible name).
   */
  tarpitBlogAria: string;
  /** URL of the tarpit blog post. */
  tarpitBlogUrl: string;
  /** Label for the tarpit hits metric. */
  tarpitHits: string;
  /** Unit label for tarpit hit counts. */
  tarpitHitsUnit: string;
  /**
   * Extra descriptive text composed after the visible link text to build an
   * `aria-label` for the port scanner honeypot blog post link (WCAG 2.5.3
   * Label in Name: the visible text must remain the start of the accessible
   * name).
   */
  portScannerBlogAria: string;
  /** URL of the port scanner blog post. */
  portScannerBlogUrl: string;
  /** Heading for the attack regions section. */
  attackRegions: string;
  /** ARIA label for the attack regions list. */
  attackRegionsList: string;
  /** Text shown when no attack regions are detected. */
  noAttackRegions: string;
  /** Unit label for hit counts in attack regions. */
  hits: string;
  /** Label for the rate-limited requests metric. */
  rateLimits: string;
  /** Heading for the system status section. */
  systemStatus: string;
  /** Heading for the node resource load subsection. */
  nodeResourceLoad: string;
  /** Prefix text before the CPU usage value. */
  cpuUsagePrefix: string;
  /** Unit label for CPU percentage. */
  percentCPU: string;
  /** Label for the memory usage metric. */
  memoryUsage: string;
  /** Unit label for RAM percentage. */
  percentRAM: string;
  /** Heading for the load status indicator. */
  loadStatus: string;
  /** Status text when load is critical. */
  statusCritical: string;
  /** Status text when load is high. */
  statusHigh: string;
  /** Status text when load is elevated. */
  statusElevated: string;
  /** Status text when load is optimal. */
  statusOptimal: string;
  /** Status text when load is healthy. */
  statusHealthy: string;
  /** Status text when load status cannot be determined. */
  statusUnknown: string;
  /** Label for CPU temperature. */
  cpuTemp: string;
  /** Kicker for the edge-defense spotlight (rendered as a mono `// ` label). */
  edgeDefense: string;
  /** Chip beside the edge-defense kicker (e.g. "router + nginx"). */
  edgeDefenseChip: string;
  /** Label under the hero aggregate number (e.g. "threats blocked · 24h"). */
  threatsBlocked: string;
  /** Prose describing how the WAF/honeypot pipeline decides what to block. */
  edgeDescription: string;
  /** "Learn more" link label pointing to the tarpit write-up. */
  linkTarpit: string;
  /** "Learn more" link label pointing to the honeypot/CrowdSec write-up. */
  linkHoneypot: string;
  /** One-line description of the defense data flow. */
  flowBand: string;
  /** Title of the MikroTik (network-layer) column. */
  mikrotikTitle: string;
  /** Sub-label for the MikroTik column (e.g. "network layer · honeypot"). */
  mikrotikLayer: string;
  /** Title of the CrowdSec + NGINX (application-layer) column. */
  crowdsecTitle: string;
  /** Sub-label for the CrowdSec column (e.g. "application layer · WAF"). */
  crowdsecLayer: string;
  /** Label for the honeypot hits metric. */
  honeypotHits: string;
  /** Label for the blacklisted scanners metric. */
  blacklistScanners: string;
  /** Label for the packets the router dropped from banned sources, 24 h. */
  routerDrops: string;
  /** Label for the distinct IPs behind the nginx refusals, 24 h. */
  banIps: string;
  /** Label for the size of the address list the router enforces. */
  routerBlocklist: string;
  /** Label for the active connections metric. */
  activeConnections: string;
  /** Label for the WAN 24h traffic metric. */
  wanTraffic: string;
  /** Label for the CrowdSec blocked-IPs metric. */
  crowdsecBlocked: string;
}

/** Component props */
/** One country slot: the code and its pre-formatted count, both from tokens. */
interface Origin {
  readonly code: string;
  readonly count: string;
}

interface Props {
  readonly translations: InfrastructureTranslations;
  /**
   * Server-injected mode: pre-formatted display strings (the `HLM_*` tokens
   * from `ssr-tokens.ts`, replaced by nginx at serve time). When set, the
   * component renders them verbatim, fetches nothing, and is expected to be
   * mounted WITHOUT a `client:*` directive. The attack-regions list is not
   * available in this mode (it needs a variable-length payload, not a scalar
   * token) and is simply omitted. See `ssr-tokens.ts` for the full contract.
   */
  readonly ssr: {
    readonly threats: string;
    readonly honeypot: string;
    readonly tarpit: string;
    readonly nginxBans: string;
    readonly banIps: string;
    readonly crowdsec: string;
    readonly blacklist: string;
    readonly routerDrops: string;
  };
  /**
   * Busiest four attacking country codes per layer, as tokens. A slot the
   * server has no country for resolves to an em dash and is skipped.
   */
  readonly origins: {
    readonly router: readonly Origin[];
    readonly nginx: readonly Origin[];
  };
}

/** One country slot: the code and its pre-formatted count, both from tokens. */
interface Origin {
  readonly code: string;
  readonly count: string;
}

interface Props {
  readonly translations: InfrastructureTranslations;
  /**
   * Server-injected mode: pre-formatted display strings (the `HLM_*` tokens
   * from `ssr-tokens.ts`, replaced by nginx at serve time). When set, the
   * component renders them verbatim, fetches nothing, and is expected to be
   * mounted WITHOUT a `client:*` directive. The attack-regions list is not
   * available in this mode (it needs a variable-length payload, not a scalar
   * token) and is simply omitted. See `ssr-tokens.ts` for the full contract.
   */
  readonly ssr: {
    readonly threats: string;
    readonly honeypot: string;
    readonly tarpit: string;
    readonly nginxBans: string;
    readonly banIps: string;
    readonly crowdsec: string;
    readonly blacklist: string;
    readonly routerDrops: string;
  };
  /**
   * Busiest four attacking country codes per layer, as tokens. A slot the
   * server has no country for resolves to an em dash and is skipped.
   */
  readonly origins: {
    readonly router: readonly Origin[];
    readonly nginx: readonly Origin[];
  };
}

/**
 * Infrastructure insights component.
 * Displays real-time statistics from Nginx and InfluxDB.
 *
 * @param props - Component properties including translations.
 */
export default function InfrastructureInsights({
  translations: t,
  ssr,
  origins,
}: Props) {
  // Four fixed token slots stand in for each variable-length list: a slot the
  // server has no country for resolves to an em dash, which is what "unused"
  // looks like from here.
  const used = (list: readonly Origin[]) =>
    list.filter((o) => o.code && o.code !== "\u{2014}");
  const routerCountries = used(origins.router);
  const nginxCountries = used(origins.nginx);
  // Same badge list under each column, over that column's own countries.
  const regions = (list: readonly Origin[]) =>
    list.length > 0 && (
      <div className="edge-regions">
        <span className="edge-regions__label">{t.attackRegions}</span>
        <ul
          className="country-list"
          aria-label={t.attackRegionsList}
        >
          {list.map((c) => (
            <li
              key={c.code}
              className="country-badge"
              title={`${c.count} ${t.hits}`}
            >
              {c.code}
              {/* The count is the badge's whole point for a screen reader, and
                  `aria-label` cannot carry it: an <li> has an implicit
                  listitem role, which takes no accessible name (html-validate
                  aria-label-misuse). A hidden span reads it out instead. */}
              <span className="sr-only">{` \u{2014} ${c.count} ${t.hits}`}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  const threatsDisplay = ssr.threats;

  // Four headline sub-metrics shown in the hero band (all distinct real fields).
  const fwTop = [
    { label: t.honeypotHits, value: ssr.honeypot },
    { label: t.tarpitHits, value: ssr.tarpit },
    { label: t.nginxBans, value: ssr.nginxBans },
    { label: t.crowdsecBlocked, value: ssr.crowdsec },
  ];

  // Rows of the two layer columns.
  const rows = {
    blacklist: ssr.blacklist,
    routerDrops: ssr.routerDrops,
    crowdsec: ssr.crowdsec,
    tarpit: ssr.tarpit,
    nginxBans: ssr.nginxBans,
    banIps: ssr.banIps,
  };

  return (
    <section
      className="infrastructure-section edge-defense"
      aria-label={t.ariaLabel}
    >
      <div className="edge-defense__head">
        <p className="section-title">{t.edgeDefense}</p>
        <span className="edge-defense__chip">{t.edgeDefenseChip}</span>
      </div>

      <div className="edge-card">
        <div className="edge-hero">
          <span
            className="i-mdi:shield-check-outline edge-hero__icon"
            aria-hidden="true"
          />
          <div className="edge-hero__lead">
            <div className="edge-hero__headline">
              <output className="edge-hero__num">{threatsDisplay}</output>
              <span className="edge-hero__label">{t.threatsBlocked}</span>
            </div>
            <p className="edge-hero__desc">{t.edgeDescription}</p>
          </div>
          <div className="edge-hero__metrics">
            {fwTop.map((m) => (
              <div
                className="edge-metric"
                key={m.label}
              >
                <span className="edge-metric__num">{m.value}</span>
                <span className="edge-metric__label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="edge-flow">{t.flowBand}</p>

        <div className="edge-cols">
          {/* Network layer — MikroTik + honeypot */}
          <article
            className="edge-col"
            aria-labelledby="edge-mikrotik-title"
          >
            <header className="edge-col__head">
              <span
                className="i-simple-icons:mikrotik edge-col__icon"
                aria-hidden="true"
              />
              <span className="edge-col__heading">
                <span
                  className="edge-col__title"
                  id="edge-mikrotik-title"
                >
                  {t.mikrotikTitle}
                </span>
                <span className="edge-col__sub">{t.mikrotikLayer}</span>
              </span>
            </header>
            <dl className="edge-rows">
              {/* port_scanners_dropped === honeypot_hits (same backend counter).
                  "Honeypot hits" is already in the hero band above; the redundant
                  "Port Scanners" row has been removed per §E. */}
              <div className="edge-row">
                <dt>{t.blacklistScanners}</dt>
                <dd>{rows.blacklist}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.routerDrops}</dt>
                <dd>{rows.routerDrops}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.routerBlocklist}</dt>
                <dd>{rows.crowdsec}</dd>
              </div>
            </dl>
            {regions(routerCountries)}
          </article>

          {/* Application layer — CrowdSec WAF + NGINX */}
          <article
            className="edge-col"
            aria-labelledby="edge-crowdsec-title"
          >
            <header className="edge-col__head">
              <span
                className="i-mdi:shield-outline edge-col__icon"
                aria-hidden="true"
              />
              <span className="edge-col__heading">
                <span
                  className="edge-col__title"
                  id="edge-crowdsec-title"
                >
                  {t.crowdsecTitle}
                </span>
                <span className="edge-col__sub">{t.crowdsecLayer}</span>
              </span>
            </header>
            <dl className="edge-rows">
              <div className="edge-row">
                <dt>
                  <a
                    href={t.tarpitBlogUrl}
                    className="insight-link"
                    aria-label={`${t.tarpitHits} — ${t.tarpitBlogAria}`}
                  >
                    {t.tarpitHits}
                  </a>
                </dt>
                <dd>{rows.tarpit}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.nginxBans}</dt>
                <dd>{rows.nginxBans}</dd>
              </div>
              <div className="edge-row">
                <dt>{t.banIps}</dt>
                <dd>{rows.banIps}</dd>
              </div>
            </dl>
            {regions(nginxCountries)}
          </article>
        </div>
      </div>

      <div className="edge-links">
        <a
          href={t.tarpitBlogUrl}
          className="edge-link"
          aria-label={`${t.linkTarpit} — ${t.tarpitBlogAria}`}
        >
          {t.linkTarpit}
        </a>
        <a
          href={t.portScannerBlogUrl}
          className="edge-link"
          aria-label={`${t.linkHoneypot} — ${t.portScannerBlogAria}`}
        >
          {t.linkHoneypot}
        </a>
      </div>
    </section>
  );
}
