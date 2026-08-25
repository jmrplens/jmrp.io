import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Dated events in a vertical rail. Date, title and description are props, so
 * the tag alone would delete the entire block: nothing here lives in the MDX
 * body. The descriptions already carry markdown links, which the component
 * expands itself, so they are passed through untouched.
 *
 * `type` is dropped, and not for brevity. It picks a dot colour AND a visible
 * badge whose wording — "Standard", "Deprecated", "Milestone" — was written
 * for a spec-version timeline and is simply false on the history timelines
 * that use it: post 009 tags "2013 — Snowden Revelations" as `warning`, which
 * the badge renders as "Deprecated". Copying that into the corpus would state
 * something untrue; the date, title and description say everything the entry
 * actually means. `icon` is decorative and goes the same way.
 */
interface TimelineEvent {
  date?: string;
  title?: string;
  description?: string;
}

export default markdownFor({
  tag: "Timeline",
  toMarkdown(node, ctx) {
    const events = ctx.expr<TimelineEvent[]>(node, "events");
    if (!Array.isArray(events)) return ctx.body(node);

    const bullets = events.flatMap((event) => {
      const head = [event?.date, event?.title]
        .filter((part) => typeof part === "string" && part.trim() !== "")
        .join(" — ");
      const description = event?.description?.trim();
      if (!head) return description ? [`- ${description}`] : [];
      const tail = description ? `: ${description}` : "";
      return [`- **${head}**${tail}`];
    });

    return bullets.length > 0 ? bullets.join("\n") : ctx.body(node);
  },
});
