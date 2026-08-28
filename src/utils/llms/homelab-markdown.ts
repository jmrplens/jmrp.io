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
 *    minute would be the most misleading thing in the file.
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
    `URL: ${siteUrl}${prefix}/homelab/`,
    `Language: ${locale}`,
    `Alternate: ${siteUrl}${otherPrefix}/homelab/index.md`,
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
  ];

  for (const service of services) {
    out.push(
      `### ${t(service.nameKey)}`,
      "",
      t(service.descriptionKey),
      "",
      `- URL: ${service.url}`,
    );
    if (service.userInfo) out.push(`- ${service.userInfo}`);
    const status =
      HLM.serviceStatus[service.id as keyof typeof HLM.serviceStatus];
    if (service.probed && status) {
      out.push(`- ${label(t("pages.homelab.twinStatus"))}: ${status.status}`);
    }
    const stats = service.statsType
      ? HLM.services[service.statsType]
      : undefined;
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
  }

  out.push(`## ${t("pages.homelab.torKicker")}`, "");
  for (const node of torServices) {
    const ssr = HLM.torNodes[node.torType];
    out.push(
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
    );
  }

  out.push(`## ${t("pages.homelab.kicker")}`, "");
  for (const node of nodes) {
    const ssr = HLM.nodes[node.key as keyof typeof HLM.nodes];
    if (!ssr) continue;
    out.push(
      `- **${node.name}** (${node.role}) — ${t("pages.homelab.nodeCpu")} ${ssr.cpu}, ${t("pages.homelab.nodeRam")} ${ssr.mem}, ${t("pages.homelab.cpuTemp")} ${ssr.temp} (${ssr.status})`,
    );
  }

  out.push(
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
  );

  return out.join("\n");
}
