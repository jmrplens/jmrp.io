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
  /** Label for the node count in Meshtastic stats. */
  nodes: string;
  /** Visible text for the "view map" link. */
  viewMap: string;
  /** ARIA label for the "view map" link. */
  viewMapAria: string;
  /** Visible text for the "view monitor" link. */
  viewMonitor: string;
  /** ARIA label for the "view monitor" link. */
  viewMonitorAria: string;
}

/** Component props for ServiceStats */
interface Props {
  readonly type: "mastodon" | "matrix" | "meshtastic-combined";
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

/** Combined Meshtastic network statistics data */
interface MeshtasticStatsData {
  potatoNodes: number;
  meshmonitorNodes: number;
  potatoVersion: string;
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
 * Fetch Meshtastic combined service statistics
 *
 * @param setError - Callback to signal an error state.
 */
async function fetchMeshtasticStats(
  setError: (error: boolean) => void,
): Promise<MeshtasticStatsData> {
  try {
    const [resPotato, resMeshmonitor, potatoVersion] = await Promise.all([
      fetch("/api/proxy/potato/nodes").catch(() => null),
      fetch("/api/proxy/mesh/meshmonitor").catch(() => null),
      fetchPotatoVersion(),
    ]);

    const potatoData = await safeFetchJson<unknown[]>(
      resPotato,
      "Failed to parse Meshtastic Potato response",
      [],
    );
    const potatoNodes = Array.isArray(potatoData) ? potatoData.length : 0;

    const meshmonitorData = await safeFetchJson<{
      data?: { activeNodes: number };
    } | null>(
      resMeshmonitor,
      "Failed to parse Meshtastic MeshMonitor response",
      null,
    );
    const meshmonitorNodes = meshmonitorData?.data?.activeNodes ?? 0;

    // Signal error if both main data fetches failed
    if (!resPotato?.ok && !resMeshmonitor?.ok) {
      setError(true);
    }

    return { potatoNodes, meshmonitorNodes, potatoVersion };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Meshtastic stats", error);
    }
    setError(true);
    return { potatoNodes: 0, meshmonitorNodes: 0, potatoVersion: "" };
  }
}

/**
 * Fetch PotatoMesh version
 */
async function fetchPotatoVersion(): Promise<string> {
  let potatoVersion = "";
  try {
    const resVer = await fetch("/api/proxy/potato/version");
    if (resVer.ok) {
      const contentType = resVer.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          const verJson = (await resVer.json()) as { version: string };
          const ver = verJson.version;
          potatoVersion = ver || "";
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error("Failed to parse Potato version response", error);
          }
        }
      } else {
        potatoVersion = await resVer.text();
      }
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Potato version", error);
    }
  }
  return potatoVersion;
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
 * Meshtastic: PotatoMesh + MeshMonitor node counts as a key-value list.
 * The mockup shows these as two rows (label left, count right) rather than the
 * two-column big-number grid used by Mastodon/Matrix.
 */
function MeshtasticStats({
  stats,
  translations: t,
}: {
  readonly stats: MeshtasticStatsData | null;
  readonly translations: ServiceStatsTranslations;
}) {
  return (
    <dl className="svc-kv">
      <div className="svc-kv__row">
        <dt className="svc-kv__key">PotatoMesh</dt>
        <dd className="svc-kv__val">
          {stats?.potatoNodes?.toLocaleString() ?? "…"} {t.nodes}
        </dd>
      </div>
      <div className="svc-kv__row">
        <dt className="svc-kv__key">MeshMonitor</dt>
        <dd className="svc-kv__val">
          {stats?.meshmonitorNodes?.toLocaleString() ?? "…"} {t.nodes}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Displays live statistics for a specific service (Mastodon, Matrix, or Meshtastic).
 * Fetches data on the client side and renders the appropriate sub-component.
 *
 * @param props - Component properties.
 * @param props.type - The service type to display stats for.
 * @param props.translations - Translated strings for the component.
 * @returns The rendered stats component.
 */
export default function ServiceStats({ type, translations: t }: Props) {
  const [stats, setStats] = useState<
    MastodonStatsData | MatrixStatsData | MeshtasticStatsData | null
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
          case "meshtastic-combined": {
            data = await fetchMeshtasticStats(setError);
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
    case "meshtastic-combined": {
      return (
        <MeshtasticStats
          stats={stats as MeshtasticStatsData | null}
          translations={t}
        />
      );
    }
    default: {
      return null;
    }
  }
}
