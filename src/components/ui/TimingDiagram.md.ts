import { markdownFor } from "@utils/llms/mdx/types";

/** One signal row. */
interface Signal {
  name?: string;
  wave?: string;
  data?: string[];
}

const LABEL = {
  en: {
    signal: "Signal",
    wave: "Wave",
    data: "Data",
    legend: "WaveDrom wave strings — one character per time unit.",
  },
  es: {
    signal: "Señal",
    wave: "Onda",
    data: "Datos",
    legend: "Cadenas de onda WaveDrom — un carácter por unidad de tiempo.",
  },
} as const;

/**
 * The `wave` string IS the waveform: `p......` and `x=.=.=x` are a notation, not
 * a picture of one, so they travel verbatim and the SVG is dropped. Prose
 * ("CS falls at t=0, rises at t=8") would be a lossy retelling of a string the
 * reader can already parse.
 *
 * The one thing added is naming the notation. WaveDrom is widely known, but
 * `.` meaning "hold the previous unit" is not guessable from a lone table cell,
 * so a one-line legend rides above it.
 */
export default markdownFor({
  tag: "TimingDiagram",
  toMarkdown(node, ctx) {
    const signals = ctx.expr<Signal[]>(node, "signals");
    if (!Array.isArray(signals) || signals.length === 0) return ctx.body(node);

    const label = LABEL[ctx.locale];
    const hasData = signals.some(
      (s) => Array.isArray(s?.data) && s.data.length > 0,
    );
    const rows = signals.map((signal) => {
      const cells = [`\`${signal?.name ?? ""}\``, `\`${signal?.wave ?? ""}\``];
      if (hasData) cells.push((signal?.data ?? []).join(", "));
      return `| ${cells.join(" | ")} |`;
    });

    const columns = hasData
      ? [label.signal, label.wave, label.data]
      : [label.signal, label.wave];
    const table = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...rows,
    ].join("\n");

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", label.legend, table, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
