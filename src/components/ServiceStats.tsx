import { useState, useEffect } from "preact/hooks";

interface Props {
  readonly type:
    | "mastodon"
    | "matrix"
    | "meshmonitor-lf"
    | "meshmonitor-mf"
    | "meshtastic-combined";
  readonly children?: any;
}

/**
 * Fetch Mastodon service statistics
 */
async function fetchMastodonStats(setError: (error: boolean) => void) {
  let peersCount = 0;
  let mastodonTrends = [] as any[];
  let instanceVersion = "Unknown";

  try {
    const [resPeers, resTrends, resInstance] = await Promise.all([
      fetch("https://mstdn.jmrp.io/api/v1/instance/peers"),
      fetch("https://mstdn.jmrp.io/api/v1/trends/tags?limit=3"),
      fetch("https://mstdn.jmrp.io/api/v1/instance"),
    ]);

    if (resPeers.ok) {
      const peersData = await resPeers.json();
      peersCount = Array.isArray(peersData) ? peersData.length : 0;
    }

    if (resTrends.ok) {
      mastodonTrends = await resTrends.json();
    }

    if (resInstance.ok) {
      const instanceData = await resInstance.json();
      instanceVersion = instanceData.version;
    }
  } catch (e) {
    console.warn("Mastodon Network Error:", e);
    setError(true);
  }

  return { peersCount, mastodonTrends, instanceVersion };
}

/**
 * Fetch Matrix service statistics
 */
async function fetchMatrixStats(setError: (error: boolean) => void) {
  let matrixData: any = {};
  let matrixFed: any = null;

  try {
    const resConfig = await fetch(
      "https://matrix.jmrp.io/.well-known/matrix/client",
    );
    if (resConfig.ok) matrixData = await resConfig.json();

    const resVer = await fetch(
      "https://matrix.jmrp.io/_matrix/client/versions",
    );
    if (resVer.ok) {
      matrixData.online = true;
      const verData = await resVer.json();
      matrixData.versions = verData.versions;
    }

    const resFed = await fetch(
      "https://matrix.jmrp.io/_matrix/federation/v1/version",
    );
    if (resFed.ok) matrixFed = await resFed.json();

    const resDest = await fetch(
      "https://matrix.jmrp.io/public_stats/federation",
    );
    if (resDest.ok) {
      const destData = await resDest.json();
      matrixData.federationTotal = destData.total;
    }
  } catch (e) {
    console.warn("Matrix Network Error:", e);
    setError(true);
  }

  return { matrixData, matrixFed };
}

/**
 * Fetch Meshtastic combined service statistics
 */
async function fetchMeshtasticStats() {
  const [resPotato, resLF, resMF] = await Promise.all([
    fetch("https://potatomesh.jmrp.io/api/nodes").catch(() => null),
    fetch("https://mesh.jmrp.io/public_stats/lf").catch(() => null),
    fetch("https://mesh.jmrp.io/public_stats/mf").catch(() => null),
  ]);

  let potatoNodes = 0;
  let lfNodes = 0;
  let mfNodes = 0;

  if (resPotato?.ok) {
    const data = await resPotato.json();
    potatoNodes = Array.isArray(data) ? data.length : 0;
  }
  if (resLF?.ok) {
    const data = await resLF.json();
    lfNodes = data.data?.activeNodes ?? 0;
  }
  if (resMF?.ok) {
    const data = await resMF.json();
    mfNodes = data.data?.activeNodes ?? 0;
  }

  const potatoVersion = await fetchPotatoVersion();

  return { potatoNodes, lfNodes, mfNodes, potatoVersion };
}

/**
 * Fetch PotatoMesh version
 */
async function fetchPotatoVersion(): Promise<string> {
  let potatoVersion = "";
  try {
    const resVer = await fetch("https://potatomesh.jmrp.io/version");
    if (resVer.ok) {
      try {
        const verJson = await resVer.json();
        potatoVersion = verJson.version;
      } catch {
        potatoVersion = await resVer.text();
      }
    }
  } catch (e) {
    console.warn("Potato Version Error", e);
  }
  return potatoVersion;
}

export default function ServiceStats({ type, children }: Props) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        let data;
        if (type === "mastodon") {
          data = await fetchMastodonStats(setError);
        } else if (type === "matrix") {
          data = await fetchMatrixStats(setError);
        } else if (type === "meshtastic-combined") {
          data = await fetchMeshtasticStats();
        }
        setStats(data);
      } catch (err) {
        console.warn("ServiceStats Error:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [type]);

  if (loading) {
    return <div class="stats-loading">Loading stats...</div>;
  }

  if (error || !stats) {
    return <div class="stats-error">Service Unavailable</div>;
  }

  if (type === "mastodon") {
    const { peersCount, mastodonTrends, instanceVersion } = stats;

    return (
      <div class="stats-wrapper-col">
        {/* Header: Status & Network */}
        <div class="status-header">
          <div class="status-badge">
            <span class="status-dot"></span>
            <strong>Online</strong>
          </div>
          <div class="status-text-muted">
            <strong class="status-text">
              {peersCount?.toLocaleString() || "?"}
            </strong>{" "}
            Known Instances
          </div>
        </div>

        {/* Instance Version (Dynamic) */}
        <div class="server-grid">
          <div class="component-row">
            <span class="component-icon brand-mastodon">
              {/* Simple Mastodon SVG */}
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

        {/* Trending Tags (Filled Buttons) */}
        {mastodonTrends && mastodonTrends.length > 0 && (
          <div>
            <h5 class="trending-header">Trending Now</h5>
            <div class="trending-grid">
              {mastodonTrends.map((tag: any) => (
                <a href={tag.url} target="_blank" class="stat-btn-filled">
                  <span class="opacity-60">#</span> {tag.name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === "matrix") {
    const { matrixData, matrixFed } = stats;
    const synapseVersion = matrixFed?.server?.version || "Unknown";

    return (
      <div class="stats-wrapper-col">
        {/* Header: Status & Network */}
        <div class="status-header">
          <div class="status-badge">
            <span class="status-dot"></span>
            <strong>Online</strong>
          </div>
          {matrixData?.federationTotal && (
            <div class="status-text-muted">
              <strong class="status-text">
                {matrixData.federationTotal.toLocaleString()}
              </strong>{" "}
              Known Servers
            </div>
          )}
        </div>

        {/* Internal Server Grid (Dynamic Synapse Version Only) */}
        <div class="server-grid">
          {/* Synapse */}
          <div class="component-row">
            <span class="component-icon brand-matrix">
              {/* Simple Matrix SVG Icon */}
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

  if (type === "meshmonitor-lf") {
    return (
      <div class="stat-item">
        <span>LongFast Nodes:</span>{" "}
        <strong>{stats.data?.activeNodes || "?"}</strong>
      </div>
    );
  }

  if (type === "meshmonitor-mf") {
    return (
      <div class="stat-item">
        <span>MedFast Nodes:</span>{" "}
        <strong>{stats.data?.activeNodes || "?"}</strong>
      </div>
    );
  }

  if (type === "meshtastic-combined") {
    const { potatoNodes, lfNodes, mfNodes, potatoVersion } = stats;

    // Helper to render the green dot status
    const StatusDot = () => <span class="status-dot-inline"></span>;

    return (
      <div class="stats-wrapper-small-gap">
        {/* 1. PotatoMesh Row */}
        <div class="meshtastic-row">
          <div class="meshtastic-left">
            <StatusDot />
            <div>
              <strong class="meshtastic-title">PotatoMesh</strong>
              <div class="meshtastic-sub">
                {potatoNodes} Nodes
                {potatoVersion && (
                  <span class="meshtastic-ver">• {potatoVersion}</span>
                )}
              </div>
            </div>
          </div>
          <a
            href="https://potatomesh.jmrp.io"
            target="_blank"
            class="btn btn-outline btn-xs"
            aria-label="View PotatoMesh Map"
          >
            View Map
          </a>
        </div>

        {/* 2. MeshMonitor LF Row */}
        <div class="meshtastic-row">
          <div class="meshtastic-left">
            <StatusDot />
            <div>
              <strong class="meshtastic-title">MeshMonitor LF</strong>
              <div class="meshtastic-sub">{lfNodes} Nodes</div>
            </div>
          </div>
          <a
            href="https://mesh_lf.jmrp.io/meshmonitor"
            target="_blank"
            class="btn btn-outline btn-xs"
            aria-label="View MeshMonitor LF"
          >
            View Monitor
          </a>
        </div>

        {/* 3. MeshMonitor MF Row */}
        <div class="meshtastic-row">
          <div class="meshtastic-left">
            <StatusDot />
            <div>
              <strong class="meshtastic-title">MeshMonitor MF</strong>
              <div class="meshtastic-sub">{mfNodes} Nodes</div>
            </div>
          </div>
          <a
            href="https://mesh_mf.jmrp.io/meshmonitor"
            target="_blank"
            class="btn btn-outline btn-xs"
            aria-label="View MeshMonitor MF"
          >
            View Monitor
          </a>
        </div>
      </div>
    );
  }

  return null;
}
