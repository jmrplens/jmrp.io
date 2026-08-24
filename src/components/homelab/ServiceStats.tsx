/** Translations required by ServiceStats. Passed from Astro parent. */
export interface ServiceStatsTranslations {
  /** Label shown when the service API is unavailable. */
  serviceUnavailable: string;
  /** Label for the known instances count (e.g. Mastodon peers). */
  knownInstances: string;
  /** Label for the known servers count (e.g. Matrix federation). */
  knownServers: string;
  /** Heading for the trending topics section. */
  trendingNow: string;
  /** PDS: caption for the headline self-hosted repo-records count. */
  pdsRecords: string;
}

/** Component props for ServiceStats */
interface Props {
  readonly type: "mastodon" | "matrix" | "pds";
  readonly translations: ServiceStatsTranslations;
  /**
   * Server-injected mode: the two pre-formatted display strings for this
   * service (the `HLM_*` tokens from `ssr-tokens.ts`, replaced by nginx at
   * serve time). When set, the component renders them verbatim, fetches
   * nothing, and is expected to be mounted WITHOUT a `client:*` directive.
   * `primary` is the big figure (peers / federation servers / records);
   * `secondary` is the running software version.
   */
  readonly ssr: { readonly primary: string; readonly secondary: string };
}

function ServiceStatCard({
  stats,
}: {
  readonly stats: readonly { value: string; label: string }[];
}) {
  return (
    <div className="svc-stats__grid">
      {stats.map((s) => (
        <div
          className="svc-stat"
          key={s.label}
        >
          <span className="svc-stat__value">{s.value}</span>
          <span className="svc-stat__label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Displays live statistics for a specific service (Mastodon, Matrix, or PDS).
 * Fetches data on the client side and renders the appropriate sub-component.
 *
 * @param props - Component properties.
 * @param props.type - The service type to display stats for.
 * @param props.translations - Translated strings for the component.
 * @returns The rendered stats component.
 */
export default function ServiceStats({ type, translations: t, ssr }: Props) {
  const primaryLabel = {
    mastodon: t.knownInstances,
    matrix: t.knownServers,
    pds: t.pdsRecords,
  }[type];
  const secondaryLabel = {
    mastodon: "Mastodon",
    matrix: "Synapse",
    pds: "PDS",
  }[type];
  return (
    <ServiceStatCard
      stats={[
        { value: ssr.primary, label: primaryLabel },
        { value: ssr.secondary, label: secondaryLabel },
      ]}
    />
  );
}
