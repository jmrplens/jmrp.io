import { markdownFor } from "@utils/llms/mdx/types";

/** One colored slice of a region bar. */
interface Segment {
  label?: string;
  bytes?: number;
}

/** One labelled region bar. */
interface Bar {
  label?: string;
  segments?: Segment[];
}

/**
 * The claim a memory map makes is "region X holds these things and they cost
 * these many bytes" — the bar widths are only that claim drawn to scale. So the
 * sizes are emitted as a nested list and the drawing is dropped.
 *
 * Kept: region labels, segment labels, exact byte counts, and the per-region
 * total (the number the comparison bars exist to contrast, e.g. 19,273 B of
 * pointer table against 16,261 B of offset table).
 *
 * Dropped: `scale` and `color`, which decide how wide and what color a bar is
 * and say nothing once there is no bar; and `sizeLabel`, which is a rounded,
 * locale-formatted restatement of `bytes` ("≈ 13,8 KB") — the exact count is
 * strictly more informative and cannot be misread as 13.8 versus 13,8.
 */
export default markdownFor({
  tag: "MemoryMap",
  toMarkdown(node, ctx) {
    const bars = ctx.expr<Bar[]>(node, "bars");
    if (!Array.isArray(bars) || bars.length === 0) return ctx.body(node);

    const lines: string[] = [];
    for (const bar of bars) {
      const segments = (bar?.segments ?? []).filter(Boolean);
      const total = segments.reduce(
        (sum, s) => sum + (Number(s?.bytes) || 0),
        0,
      );
      // The total only earns its line when the bar is actually a composition;
      // for a single segment it would just repeat the segment's own size.
      const head = segments.length > 1 ? ` — ${total} B total` : "";
      lines.push(`- **${bar?.label ?? ""}**${head}`);
      for (const segment of segments) {
        lines.push(
          `  - ${segment?.label ?? ""} — ${Number(segment?.bytes) || 0} B`,
        );
      }
    }

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines.join("\n"), caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
