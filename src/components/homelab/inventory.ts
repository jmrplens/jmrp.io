/**
 * What the homelab actually runs — the single roster for every surface.
 *
 * `HomelabPage.astro` used to declare these three arrays inline, which was
 * fine while the page was their only reader. The markdown twin is a second
 * one, and a second hand-kept copy of "which services exist" is a copy that
 * drifts: the page would advertise a node the document had never heard of, or
 * the reverse, and nothing would fail loudly when it happened.
 *
 * They are functions rather than constants because the link text is
 * translated, so a roster only exists relative to a locale.
 *
 * Two label rules live here rather than in either caller, because getting
 * them wrong writes something false rather than something ugly:
 *
 *  · A Tor node's headline figure is CLIENTS for a bridge and CONNECTIONS for
 *    a relay. They are different measurements and the components already
 *    distinguish them (`TorStats`); a twin that labelled all four "clients"
 *    would be publishing a number under the wrong name.
 *  · A service's secondary stat is labelled with the SOFTWARE's name —
 *    Mastodon, Synapse, PDS — not with the word "version", which is what
 *    `ServiceStats` renders.
 *
 * @module
 */

import type { NodeConfig } from "@components/homelab/NodeCards";
import { HLM } from "@components/homelab/ssr-tokens";
import type { TorType } from "@components/homelab/TorStats";
import type { TranslationKey } from "@i18n/utils";
import { getMcpServers } from "@utils/projects";

/** A public service card. */
export interface HomelabService {
  /** Stable key: the status-token id, the probe roster entry, and the anchor. */
  id: string;
  /**
   * Translation key of the schema `name`, resolved in BOTH locales rather than
   * as one page-locale string on a shared `@id`.
   */
  nameKey: TranslationKey;
  /** Product name, shown untranslated (Mastodon, Matrix, AT Protocol, MCP). */
  title: string;
  /** UnoCSS icon class for the card. */
  icon: string;
  /** Translation key of the card copy AND of the schema `description`. */
  descriptionKey: TranslationKey;
  /** Where the card links: the public entry point for the service. */
  url: string;
  /** Translated call to action for that link. */
  linkText: string;
  /**
   * Live stat pair to render, when the service publishes one. Optional: the
   * MCP card has no meaningful pair yet, and an empty `ServiceStats` would
   * render two "—" placeholders that look like a broken probe.
   */
  statsType?: "mastodon" | "matrix" | "pds";
  /** Handle or address to show verbatim, for the services that have one. */
  userInfo?: string;
  /** MCP fleet rows: callable address + live version/replicas tokens. */
  mcpFleet?: {
    endpoint: string;
    version: string;
    alive: string;
    dotClass: string;
  }[];
  /**
   * Whether nginx's `/stats/health` probe reports on this service.
   *
   * It gates BOTH the card's "online" pill and the KPI denominator, because
   * the KPI renders `<probe-online> / <count of probed cards>`: counting a
   * service the probe never looks at would render "3 / 4" and tell the reader
   * something is down. A card with `probed: false` is shown without a status
   * claim instead of with an unverified one.
   *
   * The probe's roster lives OUT of this repo
   * (`/etc/nginx/lua/homelab_health.lua`); `scripts/ci/check-homelab-probe.mjs`
   * asserts these flags and that roster are the same set.
   */
  probed: boolean;
}

/** A Tor node card. */
export interface HomelabTorService {
  /** Stable key for the card and its anchor. */
  id: string;
  /** Translation key of the node's display name. */
  nameKey: TranslationKey;
  /** UnoCSS icon class for the card. */
  icon: string;
  /** Translation key of the card copy. */
  descriptionKey: TranslationKey;
  /** Tor Metrics page for this fingerprint. */
  url: string;
  /** Translated call to action for that link. */
  linkText: string;
  /**
   * Which node this is. Selects the `HLM_*` token group AND, via
   * `torHeadlineKey`, whether the headline counts clients or connections.
   */
  torType: TorType;
}

/** Minimal translator shape, so callers can pass `useTranslations(locale)`. */
type Translate = (key: TranslationKey) => string;

/**
 * The public services, in the order the page shows them.
 *
 * @param t - Translator for the target locale.
 * @returns The service roster, including the MCP fleet rows.
 */
export async function homelabServices(t: Translate): Promise<HomelabService[]> {
  return [
    {
      id: "mastodon",
      nameKey: "pages.homelab.mastodonName",
      title: "Mastodon",
      icon: "fa-brands:mastodon",
      descriptionKey: "pages.homelab.mastodonDescription",
      url: "https://mstdn.jmrp.io/",
      linkText: t("pages.homelab.mastodonLink"),
      statsType: "mastodon",
      probed: true,
    },
    {
      id: "matrix",
      nameKey: "pages.homelab.matrixName",
      title: "Matrix",
      icon: "simple-icons:matrix",
      descriptionKey: "pages.homelab.matrixDescription",
      url: "https://matrix.to/#/@jmrplens:matrix.jmrp.io",
      linkText: t("pages.homelab.matrixLink"),
      statsType: "matrix",
      probed: true,
      userInfo: "@jmrplens:matrix.jmrp.io",
    },
    {
      id: "pds",
      nameKey: "pages.homelab.pdsName",
      title: "AT Protocol",
      icon: "simple-icons:bluesky",
      descriptionKey: "pages.homelab.pdsDescription",
      url: "https://bsky.app/profile/jmrp.io",
      linkText: t("pages.homelab.pdsLink"),
      statsType: "pds",
      probed: true,
      userInfo: "@jmrp.io",
    },
    {
      id: "mcp",
      nameKey: "pages.homelab.mcpName",
      title: "MCP",
      icon: "simple-icons:modelcontextprotocol",
      descriptionKey: "pages.homelab.mcpDescription",
      url: "https://mcp.jmrp.io/",
      linkText: t("pages.homelab.mcpLink"),
      probed: true,
      // One row per MCP server: callable address from projects.yaml plus the
      // live tokens (version, alive replicas, dot class) that nginx
      // substitutes at serve time. The token key is the endpoint's last path
      // segment (gitlab, libgen); a server without tokens still renders, with
      // em-dash placeholders.
      mcpFleet: (await getMcpServers()).map((server) => {
        const key = new URL(server.endpoint).pathname
          .split("/")
          .findLast(Boolean) as keyof typeof HLM.mcpFleet;
        const tokens = HLM.mcpFleet[key];
        return {
          endpoint: server.endpoint.replace(/^https?:\/\//, ""),
          version: tokens?.version ?? "—",
          alive: tokens?.alive ?? "—",
          dotClass: tokens?.dotClass ?? "",
        };
      }),
    },
  ];
}

/**
 * The Tor nodes, in the order the page shows them.
 *
 * @param t - Translator for the target locale.
 * @returns The Tor roster.
 */
export function homelabTorServices(t: Translate): HomelabTorService[] {
  return [
    {
      id: "tor-bridge",
      nameKey: "pages.homelab.torBridgeName",
      icon: "simple-icons:torproject",
      descriptionKey: "pages.homelab.torBridgeDescription",
      url: "https://metrics.torproject.org/rs.html#details/1508F567C54ECF5373CE2EF3BF02C62EEA1B320E",
      linkText: t("pages.homelab.torBridgeLink"),
      torType: "bridge",
    },
    {
      id: "tor-bridge-es1",
      nameKey: "pages.homelab.torBridgeEs1Name",
      icon: "simple-icons:torproject",
      descriptionKey: "pages.homelab.torBridgeEs1Description",
      url: "https://metrics.torproject.org/rs.html#details/98422E9D1648FFDB8F16C06CF58CD64B6C03A003",
      linkText: t("pages.homelab.torBridgeEs1Link"),
      torType: "bridge-es1",
    },
    {
      id: "tor-relay",
      nameKey: "pages.homelab.torRelayName",
      icon: "simple-icons:torproject",
      descriptionKey: "pages.homelab.torRelayDescription",
      url: "https://metrics.torproject.org/rs.html#details/B442687AD97B8CC73F3AED95D76E1F47A5504C14",
      linkText: t("pages.homelab.torRelayLink"),
      torType: "relay",
    },
    {
      id: "tor-relay-es",
      nameKey: "pages.homelab.torRelayEsName",
      icon: "simple-icons:torproject",
      descriptionKey: "pages.homelab.torRelayEsDescription",
      url: "https://metrics.torproject.org/rs.html#details/3467943E5042BA46FCE4DE8517B0EBCD5D1BBB1D",
      linkText: t("pages.homelab.torRelayEsLink"),
      torType: "relay-es",
    },
  ];
}

/**
 * The infrastructure nodes shown in the live resource grid.
 *
 * @param t - Translator for the target locale.
 * @returns The node roster.
 */
export function homelabNodes(t: Translate): NodeConfig[] {
  return [
    {
      key: "nginx",
      name: t("pages.homelab.nodeNginxName"),
      role: t("pages.homelab.nodeNginxRole"),
    },
    {
      key: "matrix",
      name: t("pages.homelab.nodeMatrixName"),
      role: t("pages.homelab.nodeMatrixRole"),
    },
    {
      key: "mastodon",
      name: t("pages.homelab.nodeMastodonName"),
      role: t("pages.homelab.nodeMastodonRole"),
    },
    {
      key: "truenas",
      name: t("pages.homelab.nodeTruenasName"),
      role: t("pages.homelab.nodeTruenasRole"),
    },
    {
      key: "mikrotik",
      name: t("pages.homelab.nodeRouterName"),
      role: t("pages.homelab.nodeRouterRole"),
    },
  ];
}

/**
 * Whether a Tor node's headline figure counts clients or connections.
 *
 * Bridges report the clients that connected through them; relays report peer
 * connections. `TorStats` already renders them under different labels, and
 * this is the shared statement of that rule so a second reader cannot get it
 * wrong.
 *
 * @param torType - The node's type.
 * @returns The translation key for its headline label.
 */
export function torHeadlineKey(torType: TorType): TranslationKey {
  return torType.startsWith("bridge")
    ? "pages.homelab.torClients24h"
    : "pages.homelab.torConnections24h";
}

/**
 * The software name a service's secondary stat is labelled with.
 *
 * `ServiceStats` labels the version pair with the product, not with the word
 * "version" — there is no `version` key in its translations.
 */
export const SERVICE_SOFTWARE: Record<string, string> = {
  mastodon: "Mastodon",
  matrix: "Synapse",
  pds: "PDS",
};

/**
 * Translation key of a service's HEADLINE stat label.
 *
 * Mirrors the `primaryLabel` map in `ServiceStats`: the three services count
 * different things — federated instances, known servers, stored records — and
 * a shared label would misname two of them.
 */
export const SERVICE_PRIMARY_LABEL: Record<string, TranslationKey> = {
  mastodon: "pages.homelab.knownInstances",
  matrix: "pages.homelab.knownServers",
  pds: "pages.homelab.pdsRecords",
};
