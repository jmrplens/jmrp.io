import { markdownFor } from "@utils/llms/mdx/types";

const LABEL = {
  en: {
    single: "IEEE 754 single precision (32 bits)",
    double: "IEEE 754 double precision (64 bits)",
    sign: "sign",
    exponent: "exponent",
    mantissa: "mantissa",
  },
  es: {
    single: "IEEE 754 precisión simple (32 bits)",
    double: "IEEE 754 precisión doble (64 bits)",
    sign: "signo",
    exponent: "exponente",
    mantissa: "mantisa",
  },
} as const;

/**
 * The whole content of this figure is the bit pattern of a number, and the MDX
 * carries only the number — so the decode runs here, through the same
 * `DataView` round-trip the component uses. Without it the output would say
 * "0.15625 as IEEE 754" and leave the reader to do the encoding, which is
 * exactly the step the figure was added to spare them.
 *
 * Kept: the three bit groups verbatim, and the exponent's raw value against its
 * bias — the arithmetic that turns a bit pattern back into a magnitude.
 * Dropped: the proportional bar, which is the three group widths drawn to scale.
 */
export default markdownFor({
  tag: "FloatLayout",
  toMarkdown(node, ctx) {
    const value = ctx.expr<number>(node, "value");
    if (typeof value !== "number") return ctx.body(node);

    const label = LABEL[ctx.locale];
    const double = ctx.attr(node, "precision") === "double";
    const view = new DataView(new ArrayBuffer(8));
    let bits: string;
    if (double) {
      view.setFloat64(0, value);
      bits =
        view.getUint32(0).toString(2).padStart(32, "0") +
        view.getUint32(4).toString(2).padStart(32, "0");
    } else {
      view.setFloat32(0, value);
      bits = view.getUint32(0).toString(2).padStart(32, "0");
    }
    const expWidth = double ? 11 : 8;
    const bias = double ? 1023 : 127;
    const expBits = bits.slice(1, 1 + expWidth);
    const raw = Number.parseInt(expBits, 2);

    const lines = [
      `- ${double ? label.double : label.single}: \`${value}\``,
      `- ${label.sign}: \`${bits.slice(0, 1)}\``,
      `- ${label.exponent}: \`${expBits}\` (${raw} - ${bias} = ${raw - bias})`,
      `- ${label.mantissa}: \`${bits.slice(1 + expWidth)}\``,
    ].join("\n");

    const title = ctx.attr(node, "title");
    const caption = ctx.attr(node, "caption");
    return [title ? `**${title}**` : "", lines, caption ?? ""]
      .filter(Boolean)
      .join("\n\n");
  },
});
