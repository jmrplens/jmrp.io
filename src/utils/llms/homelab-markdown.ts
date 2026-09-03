/**
 * The homelab page as markdown, with its live figures intact.
 *
 * ── Why this document carries placeholders ──────────────────────────────────
 *
 * Every other twin is a static copy of static content. This one is not: the
 * homelab page's numbers are `HLM_*` tokens that nginx substitutes per request
 * from a stale-while-revalidate cache, so this twin emits THE SAME TOKENS and
 * lets the same lua body filter fill them in. Resolving them at build time
 * would freeze them, which is the very reason the page has no static copy of
 * its own metrics.
 *
 * Two consequences, both load-bearing:
 *
 *  · The document is NOT cacheable. Its nginx location must send `no-store`
 *    and must disable `gzip_static`/`brotli_static` — a precompressed copy on
 *    disk still holds the raw tokens and is served without ever reaching the
 *    body filter, which would publish `HLM_ONLINE` verbatim.
 *  · There is no `Generated:` line. A build date on a body refreshed every
 *    minute would be the most misleading thing in the file — so the document
 *    carries `HLM_AS_OF` instead, the same live capture token the page's
 *    "injected at serve time" chip shows. It states how old the figures are,
 *    which is the question a build date would have answered wrongly.
 *
 * ── Why it is worth having ──────────────────────────────────────────────────
 *
 * Measured against the live response, /homelab/ is the densest page on the
 * site: 11.6 figures per 100 words, against 2.1–4.1 for the best posts. It was
 * the one page an answer engine could not read as markdown.
 *
 * @module
 */

import {
  homelabNodes,
  homelabServices,
  homelabTorServices,
  SERVICE_PRIMARY_LABEL,
  SERVICE_SOFTWARE,
  torHeadlineKey,
} from "@components/homelab/inventory";
import { HLM } from "@components/homelab/ssr-tokens";
import { useTranslations } from "@i18n/utils";

/**
 * A UI string used as a markdown label, with its first letter capitalized.
 *
 * The labels are reused from the page's own translations, where several are
 * written lower-case because the CSS applies `text-transform`. Markdown has no
 * such layer, so verbatim reuse mixes `Location:` and `advertised bandwidth:`
 * in one list. Only the first character is touched: the rest of the string,
 * including a deliberate `NGINX` or `CrowdSec`, is left exactly as translated.
 *
 * @param s - The translated label.
 * @returns The label, first letter upper-cased.
 */
function label(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minimal translator shape, matching `useTranslations(locale)`. */
type Translate = ReturnType<typeof useTranslations>;

/**
 * One service card as markdown lines.
 *
 * Split out of `homelabMarkdown` because every optional part of a card — the
 * handle, the status pill, the stat pair, the MCP fleet table — is a branch,
 * and four of them inside the document builder pushed its cognitive
 * complexity past what the gate allows. The branching belongs with the thing
 * that is actually optional.
 *
 * @param service - The service to render.
 * @param t - Translator for the target locale.
 * @returns The card's markdown lines.
 */
function serviceBlock(
  service: Awaited<ReturnType<typeof homelabServices>>[number],
  t: Translate,
): string[] {
  const out = [
    `### ${t(service.nameKey)}`,
    "",
    t(service.descriptionKey),
    "",
    `- URL: ${service.url}`,
  ];
  if (service.userInfo) out.push(`- ${service.userInfo}`);

  const status =
    HLM.serviceStatus[service.id as keyof typeof HLM.serviceStatus];
  if (service.probed && status) {
    out.push(`- ${label(t("pages.homelab.twinStatus"))}: ${status.status}`);
  }

  const stats = service.statsType ? HLM.services[service.statsType] : undefined;
  if (stats && service.statsType) {
    // The pair `ServiceStats` renders: a headline figure and the software
    // version, the latter labelled with the product name and not the word
    // "version" — matching the component rather than inventing a label.
    out.push(
      `- ${label(t(SERVICE_PRIMARY_LABEL[service.statsType]))}: ${stats.primary}`,
      `- ${SERVICE_SOFTWARE[service.statsType]}: ${stats.secondary}`,
    );
  }

  if (service.mcpFleet?.length) {
    out.push("", `**${t("pages.homelab.twinFleet")}**`, "");
    for (const row of service.mcpFleet) {
      out.push(
        `- \`${row.endpoint}\` — ${t("pages.homelab.torVersion")} ${row.version}, ${row.alive} ${t("pages.homelab.twinReplicas")}`,
      );
    }
  }

  out.push("");
  return out;
}

/**
 * One Tor node card as markdown lines.
 *
 * @param node - The Tor node to render.
 * @param t - Translator for the target locale.
 * @returns The card's markdown lines.
 */
function torBlock(
  node: ReturnType<typeof homelabTorServices>[number],
  t: Translate,
): string[] {
  const ssr = HLM.torNodes[node.torType];
  return [
    `### ${t(node.nameKey)}`,
    "",
    t(node.descriptionKey),
    "",
    // Clients for a bridge, connections for a relay — never the same word
    // for both. See `torHeadlineKey`.
    `- ${label(t(torHeadlineKey(node.torType)))}: ${ssr.headline}`,
    `- ${label(t("pages.homelab.torLocation"))}: ${ssr.location}`,
    `- ${label(t("pages.homelab.torBandwidth"))}: ${ssr.bandwidth}`,
    `- ${node.url}`,
    "",
  ];
}

/**
 * One infrastructure node as a single markdown list item.
 *
 * @param node - The node to render.
 * @param t - Translator for the target locale.
 * @returns The line, or nothing when the node publishes no live tokens.
 */
function nodeLine(
  node: ReturnType<typeof homelabNodes>[number],
  t: Translate,
): string[] {
  const ssr = HLM.nodes[node.key as keyof typeof HLM.nodes];
  return ssr
    ? [
        `- **${node.name}** (${node.role}) — ${t("pages.homelab.nodeCpu")} ${ssr.cpu}, ${t("pages.homelab.nodeRam")} ${ssr.mem}, ${t("pages.homelab.cpuTemp")} ${ssr.temp} (${ssr.status})`,
      ]
    : [];
}

/**
 * Renders the homelab twin for one locale.
 *
 * @param locale - Which locale's copy to render.
 * @param siteUrl - Absolute site origin, for the canonical and alternate links.
 * @returns The markdown document, tokens included.
 */
export async function homelabMarkdown(
  locale: "en" | "es",
  siteUrl: string,
): Promise<string> {
  const t = useTranslations(locale);
  const prefix = locale === "es" ? "/es" : "";
  const otherPrefix = locale === "es" ? "" : "/es";

  const services = await homelabServices(t);
  const torServices = homelabTorServices(t);
  const nodes = homelabNodes(t);

  const out: string[] = [
    `# ${t("pages.homelab.title")}`,
    "",
    `> ${t("pages.homelab.twinIntro")}`,
    "",
    // `Canonical:`, the key every other twin carries (see `documentHeader`
    // in `@utils/llms`). This one writes its header by hand because its
    // freshness line is a live token rather than the build stamp.
    `Canonical: ${siteUrl}${prefix}/homelab/`,
    `License: ${siteUrl}${prefix}/license/`,
    `Language: ${locale}`,
    `Alternate: ${siteUrl}${otherPrefix}/homelab/index.md`,
    // Not a `Generated:` line: this is the LIVE capture token, substituted
    // per request like every figure below it, so it states how fresh those
    // figures are instead of when the build ran.
    //
    // The cadence is stated as a RATE, not as a maximum age. nginx refreshes
    // at most once every 60 s (`FRESH_TTL`), but the refresh is triggered by
    // a request rather than by a timer, and it is stale-while-revalidate:
    // the request that finds the capture expired is served the OLD one while
    // the new one is fetched. So "at most 60 s old" would be false on a quiet
    // page — nothing fires the refresh — while "at most once a minute" is an
    // upper bound on the rate and cannot be falsified. The exact age is right
    // there in the capture time anyway; this only says how often it can move.
    `${t("pages.homelab.twinCapturedAt")}: ${HLM.asOf} (${t("pages.homelab.twinRefresh")})`,
    "",
    `## ${t("pages.homelab.twinOverview")}`,
    "",
    `- ${label(t("pages.homelab.kpiServicesOnline"))}: ${HLM.kpi.online} / ${services.filter((s) => s.probed).length}`,
    `- ${label(t("pages.homelab.kpiRequests24h"))}: ${HLM.kpi.requests}`,
    `- ${label(t("pages.homelab.kpiWan24h"))}: ${HLM.kpi.wan}`,
    `- ${nodes.length + torServices.length} ${t("pages.homelab.kpiMonitoredNodes")} (${nodes.length} infra, ${torServices.length} Tor)`,
    "",
    `## ${t("pages.homelab.servicesKicker")}`,
    "",
    ...services.flatMap((service) => serviceBlock(service, t)),

    `## ${t("pages.homelab.torKicker")}`,
    "",
    ...torServices.flatMap((node) => torBlock(node, t)),

    `## ${t("pages.homelab.kicker")}`,
    "",
    ...nodes.flatMap((node) => nodeLine(node, t)),

    "",
    `## ${t("pages.homelab.edgeDefense")}`,
    "",
    `- ${label(t("pages.homelab.securityBlocks"))}: ${HLM.edge.threats}`,
    `- ${label(t("pages.homelab.honeypotHits"))}: ${HLM.edge.honeypot}`,
    `- ${label(t("pages.homelab.tarpitHits"))}: ${HLM.edge.tarpit}`,
    `- ${label(t("pages.homelab.nginxBans"))}: ${HLM.edge.nginxBans}`,
    `- ${label(t("pages.homelab.crowdsecBlocked"))}: ${HLM.edge.crowdsec}`,
    `- ${label(t("pages.homelab.blacklistScanners"))}: ${HLM.edge.blacklist}`,
    `- ${label(t("pages.homelab.activeConnections"))}: ${HLM.edge.activeConnections}`,
    "",
  ];

  return out.join("\n");
}
