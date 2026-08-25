import { markdownFor } from "@utils/llms/mdx/types";

/** One declared struct member. */
interface Member {
  type?: string;
  name?: string;
  size?: number;
  align?: number;
}

const LABEL = {
  en: {
    offset: "Offset",
    member: "Member",
    type: "Type",
    size: "Size",
    padding: "padding",
  },
  es: {
    offset: "Offset",
    member: "Miembro",
    type: "Tipo",
    size: "Tamaño",
    padding: "relleno",
  },
} as const;

/**
 * The point of this diagram is the bytes the source does NOT mention: the
 * alignment holes between members and the tail padding that make `sizeof`
 * bigger than the sum of the fields. Emitting only the `members` prop would
 * publish the half of the picture the reader could already see in the struct
 * declaration, so the layout is recomputed here with the same rules as the
 * component (alignment defaults to the member's size, capped by the
 * architecture's maximum) and the padding rows are written out explicitly.
 *
 * Kept: declaration order, per-member offset/type/size, every padding hole,
 * `sizeof` and the architecture. Dropped: `color`, which is bar styling.
 */
export default markdownFor({
  tag: "StructPacking",
  toMarkdown(node, ctx) {
    const members = ctx.expr<Member[]>(node, "members");
    if (!Array.isArray(members) || members.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const arch = ctx.attr(node, "arch") ?? "32-bit";
    const maxAlign = arch === "64-bit" ? 8 : 4;
    /**
     * A member's effective alignment.
     *
     * @param member - The declared member.
     * @returns Its alignment in bytes, capped by the architecture.
     */
    const alignOf = (member: Member): number =>
      Math.max(1, Math.min(member?.align ?? member?.size ?? 1, maxAlign));

    const rows: string[] = [];
    let offset = 0;
    let padding = 0;
    /**
     * Appends a padding row when the next member needs realignment.
     *
     * @param align - The alignment to satisfy.
     */
    const pad = (align: number): void => {
      const hole = (align - (offset % align)) % align;
      if (hole === 0) return;
      rows.push(`| ${offset} | *${label.padding}* | — | ${hole} B |`);
      offset += hole;
      padding += hole;
    };

    for (const member of members) {
      pad(alignOf(member));
      const size = Math.max(0, Number(member?.size) || 0);
      rows.push(
        `| ${offset} | \`${member?.name ?? ""}\` | \`${member?.type ?? ""}\` | ${size} B |`,
      );
      offset += size;
    }
    // Trailing padding to the struct's own alignment — the strictest member's.
    pad(Math.max(...members.map((m) => alignOf(m))));

    const table = [
      `| ${label.offset} | ${label.member} | ${label.type} | ${label.size} |`,
      "| ---: | --- | --- | ---: |",
      ...rows,
    ].join("\n");
    // A struct with no holes is a fact worth stating plainly; appending
    // "padding 0 B" to say it would only add a term that is almost always 0.
    const holes = padding > 0 ? ` · ${label.padding} ${padding} B` : "";
    const summary = `\`sizeof\` = ${offset} B${holes} · ${arch}`;

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", table, summary, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
