import { markdownFor } from "@utils/llms/mdx/types";

const LABEL = {
  en: {
    netmask: "Netmask",
    network: "Network",
    broadcast: "Broadcast",
    hosts: "Usable hosts",
  },
  es: {
    netmask: "Máscara",
    network: "Red",
    broadcast: "Broadcast",
    hosts: "Hosts utilizables",
  },
} as const;

/**
 * Everything this diagram shows is DERIVED: the props are only an address and a
 * prefix, and the component computes the mask, the network and broadcast
 * addresses and the host count. Emitting the props alone would publish the
 * question and drop the answer, so the same arithmetic runs here.
 *
 * Dropped: the per-octet bit pattern. It is the same address written in base 2 —
 * true, but re-derivable from a line already in the output, and four rows of
 * ones and zeros crowd out the four facts that are not.
 *
 * The /31 and /32 host counts follow the component (2 and 1), which is the
 * point-to-point reading of RFC 3021 rather than the naive 2^n − 2.
 */
export default markdownFor({
  tag: "SubnetSplit",
  toMarkdown(node, ctx) {
    const ip = ctx.attr(node, "ip");
    const prefix = ctx.expr<number>(node, "prefix");
    if (!ip || typeof prefix !== "number") return ctx.body(node);

    const octets = ip.split(".").map((o) => Number.parseInt(o, 10) & 255);
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) {
      return ctx.body(node);
    }
    const u32 =
      ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>>
      0;
    const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0;
    const network = (u32 & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    /**
     * Formats a 32-bit value as a dotted quad.
     *
     * @param value - The address as an unsigned 32-bit integer.
     * @returns Dotted-decimal notation.
     */
    const dotted = (value: number): string =>
      [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

    let hosts = 2 ** (32 - prefix) - 2;
    if (prefix === 32) hosts = 1;
    else if (prefix === 31) hosts = 2;

    const label = LABEL[ctx.locale];
    const facts = [
      `- \`${ip}/${prefix}\``,
      `- ${label.netmask}: \`${dotted(mask)}\``,
      `- ${label.network}: \`${dotted(network)}\``,
      `- ${label.broadcast}: \`${dotted(broadcast)}\``,
      `- ${label.hosts}: ${hosts}`,
    ].join("\n");

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", facts, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
