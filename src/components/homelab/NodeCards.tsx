import { useEffect, useRef, useState } from "preact/hooks";

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
}

/** Static per-node configuration (name, role, API endpoint). */
export interface NodeConfig {
  /** Stable key for the React list. */
  key: string;
  /** API endpoint returning cpu_usage_avg / mem_used_percent / cpu_temp. */
  endpoint: string;
  /** Display name (e.g. "NGINX Edge"). */
  name: string;
  /** Mono sub-label describing the node's role. */
  role: string;
}

/** Component props. */
interface Props {
  readonly translations: NodeCardsTranslations;
  readonly nodes: readonly NodeConfig[];
}

/** Live resource figures for a single node. */
interface NodeLoad {
  cpu: number;
  mem: number;
  temp: number | null;
}

/** A metric at/above this percentage is considered "high load". */
const HIGH_LOAD = 80;

/**
 * Extract CPU / RAM / temperature from a homelab endpoint. Most nodes report
 * `cpu_usage_avg`; the MikroTik router reports `cpu_load` — accept either.
 */
function parseLoad(data: unknown): NodeLoad | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  let cpu: number | null = null;
  if (typeof d.cpu_usage_avg === "number") cpu = d.cpu_usage_avg;
  else if (typeof d.cpu_load === "number") cpu = d.cpu_load;
  if (cpu === null || typeof d.mem_used_percent !== "number") return null;
  return {
    cpu,
    mem: d.mem_used_percent,
    temp: typeof d.cpu_temp === "number" ? d.cpu_temp : null,
  };
}

/** Clamp a percentage into the 0–100 range for the progress bar width. */
function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Compact infrastructure node grid — one card per monitored node showing live
 * CPU / RAM / temperature. Each node is fetched independently so a single
 * unreachable endpoint only blanks its own card. Bars turn amber past the
 * high-load threshold; the status pill and temperature label mirror that state
 * with a shape (dot vs triangle) as well as colour.
 */
export default function NodeCards({ translations: t, nodes }: Props) {
  const [loads, setLoads] = useState<Record<string, NodeLoad | null>>({});
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const REFRESH_INTERVAL = 30_000;

    const fetchAll = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        const token =
          document.querySelector<HTMLElement>("[data-homelab-token]")?.dataset
            .homelabToken ?? "";
        const headers = { "X-Homelab-Token": token };
        const entries = await Promise.all(
          nodes.map(async (node) => {
            try {
              const res = await fetch(node.endpoint, {
                signal: controller.signal,
                headers,
              });
              if (!res.ok) return [node.key, null] as const;
              return [node.key, parseLoad(await res.json())] as const;
            } catch (error: unknown) {
              if (
                error instanceof DOMException &&
                error.name === "AbortError"
              ) {
                throw error;
              }
              return [node.key, null] as const;
            }
          }),
        );
        setLoads(Object.fromEntries(entries));
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        console.error("Failed to fetch node loads", error);
      } finally {
        isFetchingRef.current = false;
      }
    };

    void fetchAll();
    const intervalId = setInterval(() => void fetchAll(), REFRESH_INTERVAL);
    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, [nodes]);

  return (
    <div
      className="node-grid"
      role="group"
      aria-label={t.ariaLabel}
    >
      {nodes.map((node) => {
        const load = loads[node.key];
        const high = !!load && (load.cpu >= HIGH_LOAD || load.mem >= HIGH_LOAD);
        const pct = (v: number | undefined) =>
          v === undefined ? "…" : `${v.toFixed(1)}%`;
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
              <span
                className={`node-card__status ${
                  high ? "node-card__status--warn" : "node-card__status--ok"
                }`}
              >
                <span
                  className={high ? "i-mdi:alert-outline" : "node-card__dot"}
                  aria-hidden="true"
                />
                {high ? t.statusHighLoad : t.statusOptimal}
              </span>
            </header>

            <div className="node-card__meters">
              <div className="node-meter">
                <div className="node-meter__head">
                  <span className="node-meter__label">{t.cpu}</span>
                  <span className="node-meter__value">{pct(load?.cpu)}</span>
                </div>
                <div className="node-meter__track">
                  <div
                    className={`node-meter__fill ${
                      load && load.cpu >= HIGH_LOAD
                        ? "node-meter__fill--warn"
                        : ""
                    }`}
                    style={{ width: `${clampPct(load?.cpu ?? 0)}%` }}
                  />
                </div>
              </div>

              <div className="node-meter">
                <div className="node-meter__head">
                  <span className="node-meter__label">{t.ram}</span>
                  <span className="node-meter__value">{pct(load?.mem)}</span>
                </div>
                <div className="node-meter__track">
                  <div
                    className={`node-meter__fill ${
                      load && load.mem >= HIGH_LOAD
                        ? "node-meter__fill--warn"
                        : ""
                    }`}
                    style={{ width: `${clampPct(load?.mem ?? 0)}%` }}
                  />
                </div>
              </div>

              <div className="node-card__temp">
                <span className="node-meter__label">
                  {high ? t.tempHighLoad : t.tempOptimal}
                </span>
                <span className="node-card__temp-value">
                  {load?.temp == null ? "—" : `${Math.round(load.temp)}°C`}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
