import { useEffect, useState } from "preact/hooks";

/** Component props for ServiceStats */
interface Props {
  readonly type: "mastodon" | "matrix" | "meshtastic-combined";
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
  lfNodes: number;
  mfNodes: number;
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
    const [resPeers, resTrends, resInstance] = await Promise.all([
      fetch("/api/proxy/mastodon/peers").catch(() => null),
      fetch("/api/proxy/mastodon/trends").catch(() => null),
      fetch("/api/proxy/mastodon/instance").catch(() => null),
    ]);

    const peersData = await safeFetchJson<unknown[]>(
      resPeers,
      "Failed to parse Mastodon peers response",
      [],
    );
    const peersCount = Array.isArray(peersData) ? peersData.length : 0;

    const mastodonTrends = await safeFetchJson<{ url: string; name: string }[]>(
      resTrends,
      "Failed to parse Mastodon trends response",
      [],
    );

    const instanceData = await safeFetchJson<{ version: string } | null>(
      resInstance,
      "Failed to parse Mastodon instance response",
      null,
    );
    const instanceVersion = instanceData?.version || "Unknown";

    if (!resPeers?.ok && !resTrends?.ok && !resInstance?.ok) {
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
    const [resConfig, resVer, resFed, resDest] = await Promise.all([
      fetch("/api/proxy/matrix/config").catch(() => null),
      fetch("/api/proxy/matrix/versions").catch(() => null),
      fetch("/api/proxy/matrix/federation").catch(() => null),
      fetch("/api/proxy/matrix/stats").catch(() => null),
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

    const destData = await safeFetchJson<{ total: number } | null>(
      resDest,
      "Failed to parse Matrix stats response",
      null,
    );
    if (destData) {
      matrixData.federationTotal = destData.total;
    }

    if (!resConfig?.ok && !resVer?.ok && !resFed?.ok && !resDest?.ok) {
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
    const [resPotato, resLF, resMF, potatoVersion] = await Promise.all([
      fetch("/api/proxy/potato/nodes").catch(() => null),
      fetch("/api/proxy/mesh/lf").catch(() => null),
      fetch("/api/proxy/mesh/mf").catch(() => null),
      fetchPotatoVersion(),
    ]);

    const potatoData = await safeFetchJson<unknown[]>(
      resPotato,
      "Failed to parse Meshtastic Potato response",
      [],
    );
    const potatoNodes = Array.isArray(potatoData) ? potatoData.length : 0;

    const lfData = await safeFetchJson<{
      data?: { activeNodes: number };
    } | null>(resLF, "Failed to parse Meshtastic LF response", null);
    const lfNodes = lfData?.data?.activeNodes ?? 0;

    const mfData = await safeFetchJson<{
      data?: { activeNodes: number };
    } | null>(resMF, "Failed to parse Meshtastic MF response", null);
    const mfNodes = mfData?.data?.activeNodes ?? 0;

    // Signal error if all three main data fetches failed
    if (!resPotato?.ok && !resLF?.ok && !resMF?.ok) {
      setError(true);
    }

    return { potatoNodes, lfNodes, mfNodes, potatoVersion };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error("Failed to fetch Meshtastic stats", error);
    }
    setError(true);
    return { potatoNodes: 0, lfNodes: 0, mfNodes: 0, potatoVersion: "" };
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
 * Mastodon Stats Component
 *
 * @param props - Component properties.
 * @param props.stats - The data to display.
 */
function MastodonStats({
  stats,
}: {
  readonly stats: MastodonStatsData | null;
}) {
  const peersCount = stats?.peersCount;
  const mastodonTrends = stats?.mastodonTrends || [];
  const instanceVersion = stats?.instanceVersion || "...";

  return (
    <div class="stats-wrapper-col">
      <div class="status-header">
        <div class="status-badge">
          <span class="status-dot"></span>
          <strong>Online</strong>
        </div>
        <div class="status-text-muted">
          <strong class="status-text">{peersCount ?? "..."}</strong> Known
          Instances
        </div>
      </div>

      <div class="server-grid">
        <div class="component-row">
          <span class="component-icon brand-mastodon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="20"
              height="20"
            >
              <path
                fill="currentColor"
                d="M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127C.64 6.412.61 7.837.661 9.143c.074 1.874.088 3.745.26 5.611c.118 1.24.325 2.47.62 3.68c.55 2.237 2.777 4.098 4.96 4.857c2.336.792 4.849.923 7.256.38q.398-.092.786-.213c.585-.184 1.27-.39 1.774-.753a.06.06 0 0 0 .023-.043v-1.809a.05.05 0 0 0-.02-.041a.05.05 0 0 0-.046-.01a20.3 20.3 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.6 5.6 0 0 1-.319-1.433a.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546c.376 0 .75 0 1.125-.01c1.57-.044 3.224-.124 4.768-.422q.059-.011.11-.024c2.435-.464 4.753-1.92 4.989-5.604c.008-.145.03-1.52.03-1.67c.002-.512.167-3.63-.024-5.545m-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976c-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35c-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102q0-1.965 1.011-3.12c.696-.77 1.608-1.164 2.74-1.164c1.311 0 2.302.5 2.962 1.498l.638 1.06l.638-1.06c.66-.999 1.65-1.498 2.96-1.498c1.13 0 2.043.395 2.74 1.164q1.012 1.155 1.012 3.12z"
              />
            </svg>
          </span>
          <div class="component-info">
            <span class="component-name">Mastodon</span>
            <span class="component-version">{instanceVersion}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="trending-header">Trending Now</div>
        <div class="trending-grid">
          {mastodonTrends.length > 0
            ? mastodonTrends.map((tag: { url: string; name: string }) => (
                <a
                  key={tag.name}
                  href={tag.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="stat-btn-filled"
                >
                  <span class="opacity-60">#</span> {tag.name}
                </a>
              ))
            : // Skeletons to reserve space
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  class="stat-btn-filled skeleton"
                >
                  # {".".repeat(i * 3 + 4)}
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Matrix Stats Component
 *
 * @param props - Component properties.
 * @param props.stats - The data to display.
 */
function MatrixStats({ stats }: { readonly stats: MatrixStatsData | null }) {
  const matrixData = stats?.matrixData;
  const matrixFed = stats?.matrixFed;
  const synapseVersion = matrixFed?.server?.version || "...";

  return (
    <div class="stats-wrapper-col">
      <div class="status-header">
        <div class="status-badge">
          <span class="status-dot"></span>
          <strong>Online</strong>
        </div>
        <div class="status-text-muted">
          <strong class="status-text">
            {matrixData?.federationTotal ?? "..."}
          </strong>{" "}
          Known Servers
        </div>
      </div>

      <div class="server-grid">
        <div class="component-row">
          <span class="component-icon brand-matrix">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <path
                fill="currentColor"
                d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.56-.966 1.535-1.3 2.575-1.3s1.796.335 2.387 1.296c.613-.96 1.745-1.296 2.574-1.296c1.54 0 2.495 1.132 2.495 3.296V23h-2.19l-.003-9.632c0-1.268-.57-1.815-1.344-1.815c-.99 0-1.312.495-1.312 1.816V23h-2.208V13.369c0-1.268-.54-1.815-1.226-1.815c-.99 0-1.313.495-1.313 1.816V23H7.675V8.81h2.208v-1zM23.368.55V24h-2.28v-.55H24V0h-2.28v.55z"
              />
            </svg>
          </span>
          <div class="component-info">
            <span class="component-name">Synapse</span>
            <span class="component-version">{synapseVersion}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Internal helper for rendering a status dot */
const StatusDot = () => <span class="status-dot-inline"></span>;

/**
 * Meshtastic Combined Stats Component
 *
 * @param props - Component properties.
 * @param props.stats - The data to display.
 */
function MeshtasticStats({
  stats,
}: {
  readonly stats: MeshtasticStatsData | null;
}) {
  const potatoNodes = stats?.potatoNodes;
  const lfNodes = stats?.lfNodes;
  const mfNodes = stats?.mfNodes;
  const potatoVersion = stats?.potatoVersion;

  return (
    <div class="stats-wrapper-small-gap">
      <div class="meshtastic-row">
        <div class="meshtastic-left">
          <StatusDot />
          <div>
            <strong class="meshtastic-title">PotatoMesh</strong>
            <div class="meshtastic-sub">
              {potatoNodes ?? "..."} Nodes
              {potatoVersion && (
                <span class="meshtastic-ver">• {potatoVersion}</span>
              )}
            </div>
          </div>
        </div>
        <a
          href="https://potatomesh.jmrp.io"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm"
          aria-label="View Map on PotatoMesh"
        >
          View Map
        </a>
      </div>

      <div class="meshtastic-row">
        <div class="meshtastic-left">
          <StatusDot />
          <div>
            <strong class="meshtastic-title">MeshMonitor LF</strong>
            <div class="meshtastic-sub">{lfNodes ?? "..."} Nodes</div>
          </div>
        </div>
        <a
          href="https://mesh_lf.jmrp.io/meshmonitor"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm"
          aria-label="View Monitor on MeshMonitor LF"
        >
          View Monitor
        </a>
      </div>

      <div class="meshtastic-row">
        <div class="meshtastic-left">
          <StatusDot />
          <div>
            <strong class="meshtastic-title">MeshMonitor MF</strong>
            <div class="meshtastic-sub">{mfNodes ?? "..."} Nodes</div>
          </div>
        </div>
        <a
          href="https://mesh_mf.jmrp.io/meshmonitor"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-sm"
          aria-label="View Monitor on MeshMonitor MF"
        >
          View Monitor
        </a>
      </div>
    </div>
  );
}

/**
 * Displays live statistics for a specific service (Mastodon, Matrix, or Meshtastic).
 * Fetches data on the client side and renders the appropriate sub-component.
 *
 * @param props - Component properties.
 * @param props.type - The service type to display stats for.
 * @returns The rendered stats component.
 */
export default function ServiceStats({ type }: Props) {
  const [stats, setStats] = useState<
    MastodonStatsData | MatrixStatsData | MeshtasticStatsData | null
  >(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reset state immediately when type changes to avoid stale data
    setStats(null);
    setError(false);

    const fetchData = async () => {
      // Avoid fetching in CI/Localhost to prevent CORS errors in Lighthouse
      if (
        typeof globalThis !== "undefined" &&
        globalThis.location?.hostname === "localhost"
      ) {
        return;
      }

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
    return <div class="stats-error">Service Unavailable</div>;
  }

  // Route to appropriate component based on type
  // Note: We render even if stats is null (loading) to provide a static layout
  switch (type) {
    case "mastodon": {
      return <MastodonStats stats={stats as MastodonStatsData | null} />;
    }
    case "matrix": {
      return <MatrixStats stats={stats as MatrixStatsData | null} />;
    }
    case "meshtastic-combined": {
      return <MeshtasticStats stats={stats as MeshtasticStatsData | null} />;
    }
    default: {
      return null;
    }
  }
}
