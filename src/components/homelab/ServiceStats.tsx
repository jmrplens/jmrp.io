import { useEffect, useState } from "preact/hooks";

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
}

/** Data structure for Mastodon statistics */
interface MastodonStatsData {
  peersCount: number;
  mastodonTrends: { url: string; name: string }[];
  instanceVersion: string;
}

/** Internal Matrix data structure */
interface MatrixData {
  online?: boolean;
  versions?: {
    list?: string[];
  };
  federationTotal?: number;
}

/** Matrix federation data structure */
interface MatrixFed {
  server?: {
    version?: string;
  };
}

/** Aggregated Matrix statistics data */
interface MatrixStatsData {
  matrixData: MatrixData;
  matrixFed: MatrixFed | null;
}

/** AT Protocol PDS statistics data */
interface PdsStatsData {
  /** Total records in the self-hosted repo (posts, follows, likes…) — a
   * monotonic-ish counter that grows with activity, unlike the transient ASN
   * reach it replaced. */
  records: number;
  /** Running PDS software version. */
  version: string;
}

/**
 * Safely fetch and parse JSON from a response.
 *
 * @param res - The response object to parse.
 * @param errorMessage - Message to log on parsing error (dev only).
 * @param defaultValue - Value to return if parsing fails or response is not ok.
 * @returns The parsed data or the default value.
 */
async function safeFetchJson<T>(
  res: Response | null | undefined,
  errorMessage: string,
  defaultValue: T,
): Promise<T> {
  if (!res?.ok) return defaultValue;
  try {
    return (await res.json()) as T;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error(errorMessage, error);
    }
    return defaultValue;
  }
}

/**
 * Fetch Mastodon service statistics
 *
 * @param setError - Callback to signal an error state.
 */
async function fetchMastodonStats(setError: (error: boolean) => void) {
  try {
    const token =
      document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
        .homelabToken ?? "";
    const homelabHeaders: HeadersInit = token
      ? { "X-Homelab-Token": token }
      : {};

    const [resHomelab, resTrends] = await Promise.all([
      fetch("/api/homelab/mastodon", { headers: homelabHeaders }).catch(
        () => null,
      ),
      fetch("/api/proxy/mastodon/trends").catch(() => null),
    ]);

    const homelabData = await safeFetchJson<{
      peers_count?: number;
      instance_version?: string;
    } | null>(resHomelab, "Failed to parse Mastodon homelab response", null);
    const peersCount = homelabData?.peers_count ?? 0;
    const instanceVersion = homelabData?.instance_version || "Unknown";

    const mastodonTrends = await safeFetchJson<{ url: string; name: string }[]>(
      resTrends,
      "Failed to parse Mastodon trends response",
      [],
    );

    if (!resHomelab?.ok && !resTrends?.ok) {
      setError(true);
    }

    return { peersCount, mastodonTrends, instanceVersion };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Mastodon stats", error);
    }
    setError(true);
    return { peersCount: 0, mastodonTrends: [], instanceVersion: "Unknown" };
  }
}

/**
 * Fetch Matrix service statistics
 *
 * @param setError - Callback to signal an error state.
 */
async function fetchMatrixStats(setError: (error: boolean) => void) {
  try {
    const token =
      document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
        .homelabToken ?? "";
    const homelabHeaders: HeadersInit = token
      ? { "X-Homelab-Token": token }
      : {};

    const [resConfig, resVer, resFed, resHomelab] = await Promise.all([
      fetch("/api/proxy/matrix/config").catch(() => null),
      fetch("/api/proxy/matrix/versions").catch(() => null),
      fetch("/api/proxy/matrix/federation").catch(() => null),
      fetch("/api/homelab/matrix", { headers: homelabHeaders }).catch(
        () => null,
      ),
    ]);

    const matrixData = await safeFetchJson<MatrixData>(
      resConfig,
      "Failed to parse Matrix config response",
      {},
    );

    if (resVer?.ok) {
      matrixData.online = true;
      const verData = await safeFetchJson<{ versions: string[] } | null>(
        resVer,
        "Failed to parse Matrix versions response",
        null,
      );
      if (verData) {
        matrixData.versions = { list: verData.versions };
      }
    }

    const matrixFed = await safeFetchJson<MatrixFed | null>(
      resFed,
      "Failed to parse Matrix federation response",
      null,
    );

    const homelabData = await safeFetchJson<{
      federation_destinations?: number;
    } | null>(resHomelab, "Failed to parse Matrix homelab response", null);
    if (homelabData?.federation_destinations != null) {
      matrixData.federationTotal = homelabData.federation_destinations;
    }

    if (!resConfig?.ok && !resVer?.ok && !resFed?.ok && !resHomelab?.ok) {
      setError(true);
    }

    return { matrixData, matrixFed };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Matrix stats", error);
    }
    setError(true);
    return { matrixData: {}, matrixFed: null };
  }
}

/**
 * Fetch AT Protocol PDS statistics from the homelab API.
 *
 * @param setError - Callback to signal an error state.
 */
async function fetchPdsStats(
  setError: (error: boolean) => void,
): Promise<PdsStatsData> {
  const fallback: PdsStatsData = { records: 0, version: "Unknown" };
  try {
    const token =
      document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
        .homelabToken ?? "";
    const homelabHeaders: HeadersInit = token
      ? { "X-Homelab-Token": token }
      : {};

    const res = await fetch("/api/homelab/pds", {
      headers: homelabHeaders,
    }).catch(() => null);

    const data = await safeFetchJson<{
      version?: string;
      records?: number;
    } | null>(res, "Failed to parse PDS homelab response", null);

    if (!res?.ok || !data) {
      setError(true);
      return fallback;
    }

    return {
      records: data.records ?? 0,
      version: data.version || "Unknown",
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch PDS stats", error);
    }
    setError(true);
    return fallback;
  }
}

/**
 * Compact service-stats grid: two key stat pairs (value + label).
 * The status pill lives in the ServiceCard header; only the data grid is rendered here.
 */
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

/** Mastodon: instances federated + running server version. */
function MastodonStats({
  stats,
  translations: t,
}: {
  readonly stats: MastodonStatsData | null;
  readonly translations: ServiceStatsTranslations;
}) {
  return (
    <ServiceStatCard
      stats={[
        {
          value: stats?.peersCount?.toLocaleString() ?? "...",
          label: t.knownInstances,
        },
        { value: stats?.instanceVersion || "...", label: "Mastodon" },
      ]}
    />
  );
}

/** Matrix: known federation servers + Synapse version. */
function MatrixStats({
  stats,
  translations: t,
}: {
  readonly stats: MatrixStatsData | null;
  readonly translations: ServiceStatsTranslations;
}) {
  return (
    <ServiceStatCard
      stats={[
        {
          value: stats?.matrixData?.federationTotal?.toLocaleString() ?? "...",
          label: t.knownServers,
        },
        { value: stats?.matrixFed?.server?.version || "...", label: "Synapse" },
      ]}
    />
  );
}

/**
 * AT Protocol PDS: self-hosted repo size (total records — posts, follows,
 * likes… — a counter that grows with activity) + the running PDS version, in
 * the same two-column big-number grid used by Mastodon/Matrix. Replaces the
 * former distinct-ASN "reach" figure, which jittered on a 30-minute window.
 */
function PdsStats({
  stats,
  translations: t,
}: {
  readonly stats: PdsStatsData | null;
  readonly translations: ServiceStatsTranslations;
}) {
  return (
    <ServiceStatCard
      stats={[
        {
          value: stats?.records?.toLocaleString() ?? "...",
          label: t.pdsRecords,
        },
        { value: stats?.version || "...", label: "PDS" },
      ]}
    />
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
export default function ServiceStats({ type, translations: t }: Props) {
  const [stats, setStats] = useState<
    MastodonStatsData | MatrixStatsData | PdsStatsData | null
  >(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reset state immediately when type changes to avoid stale data
    setStats(null);
    setError(false);

    const fetchData = async () => {
      try {
        let data;
        switch (type) {
          case "mastodon": {
            data = await fetchMastodonStats(setError);
            break;
          }
          case "matrix": {
            data = await fetchMatrixStats(setError);
            break;
          }
          case "pds": {
            data = await fetchPdsStats(setError);
            break;
          }
          default: {
            console.error(`Unknown service type: ${type as string}`);
            setError(true);
            data = null;
            break;
          }
        }
        if (data) setStats(data);
      } catch {
        setError(true);
      }
    };

    void fetchData();
  }, [type]);

  if (error) {
    return <div className="stats-error">{t.serviceUnavailable}</div>;
  }

  // Route to appropriate component based on type
  // Note: We render even if stats is null (loading) to provide a static layout
  switch (type) {
    case "mastodon": {
      return (
        <MastodonStats
          stats={stats as MastodonStatsData | null}
          translations={t}
        />
      );
    }
    case "matrix": {
      return (
        <MatrixStats
          stats={stats as MatrixStatsData | null}
          translations={t}
        />
      );
    }
    case "pds": {
      return (
        <PdsStats
          stats={stats as PdsStatsData | null}
          translations={t}
        />
      );
    }
    default: {
      return null;
    }
  }
}
