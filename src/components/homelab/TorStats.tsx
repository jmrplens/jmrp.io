/** Translations required by TorStats. Passed from Astro parent. */
export interface TorStatsTranslations {
  /** Label shown when the Tor API is unavailable. */
  serviceUnavailable: string;
  /** Status text displayed when the node is running. */
  running: string;
  /** Status text displayed when the node is offline. */
  offline: string;
  /** Label for Tor version display. */
  version: string;
  /** Badge text when version is recommended. */
  recommended: string;
  /** Badge text when version is obsolete. */
  obsolete: string;
  /** Label for consensus flags. */
  flags: string;
  /** Label for pluggable transports (bridge only). */
  transports: string;
  /** Label for traffic section. */
  traffic24h: string;
  /** Download arrow label. */
  download: string;
  /** Upload arrow label. */
  upload: string;
  /** Label for client connections (bridge). */
  clients24h: string;
  /** Label for OR connections (relay). */
  orConnections: string;
  /** Label for open circuits. */
  circuits: string;
  /** Label for peer connections 24h (relay). */
  connections24h: string;
  /** Label for advertised bandwidth. */
  advertisedBandwidth: string;
  /** Location label. */
  location: string;
}

/** Props for TorStats component */
interface Props {
  /** The node type: `"bridge"` (obfs4/WebTunnel, UK), `"bridge-es1"` (obfs4/WebTunnel, ES), `"relay"` (UK middle relay), or `"relay-es"` (ES middle relay). */
  readonly type: TorType;
  readonly translations: TorStatsTranslations;
  /**
   * Server-injected mode: pre-formatted display strings (the `HLM_*` tokens
   * from `ssr-tokens.ts`, replaced by nginx at serve time). The component
   * renders them verbatim, fetches nothing, and is mounted WITHOUT a
   * `client:*` directive. If the node is offline, nginx
   * substitutes the headline with an em dash rather than a stale count.
   */
  readonly ssr: {
    readonly headline: string;
    readonly location: string;
    readonly bandwidth: string;
  };
}

/** The valid node type values for TorStats. */
export type TorType = "bridge" | "bridge-es1" | "relay" | "relay-es";

/**
 * Live Tor node stats as a compact card. Bridges show clients helped (24h);
 * relays show connections (24h). Values arrive pre-formatted from nginx as
 * `HLM_*` tokens; the component fetches nothing and never hydrates.
 *
 * @param props - Component properties.
 * @param props.type - Node type: bridge, bridge-es1, relay or relay-es.
 * @param props.translations - Translated strings for the component.
 * @returns The rendered compact Tor node card.
 */
export default function TorStats({ type, translations: t, ssr }: Props) {
  const isBridge = type === "bridge" || type === "bridge-es1";
  const headlineLabel = isBridge ? t.clients24h : t.connections24h;

  return (
    <div className="tor-node">
      <p className="tor-node__headline">
        <output className="tor-node__num">{ssr.headline}</output>
        <span className="tor-node__label">{headlineLabel}</span>
      </p>
      <div className="tor-node__rows">
        <div className="tor-node__row">
          <span className="tor-node__k">{t.location}</span>
          <span className="tor-node__v">{ssr.location}</span>
        </div>
        <div className="tor-node__row">
          <span className="tor-node__k">{t.advertisedBandwidth}</span>
          <span className="tor-node__v">{ssr.bandwidth}</span>
        </div>
      </div>
    </div>
  );
}
