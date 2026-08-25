import { markdownFor } from "@utils/llms/mdx/types";

/**
 * The offline brute-force calculator takes no props: it is a widget, and the
 * tool page's own `<ToolInfo>` prose already explains what it computes
 * (keyspace = alphabet^length, time = keyspace ÷ rate). Restating that would
 * add nothing.
 *
 * What is NOT anywhere in the page text is the reference data the widget is
 * built on — the per-GPU raw SHA-256 figures, the iteration presets and
 * the alphabet sizes — and those are exactly the numbers a model would be
 * asked for ("how fast does an RTX 5090 run SHA-256?"). So the dropdowns are
 * published as tables and the rest of the widget is dropped: sliders, the
 * device-binding toggle and the live verdict are behavior, not content.
 *
 * The one derived fact kept alongside is how the raw figure becomes a PBKDF2
 * rate, because a column of raw SHA-256 numbers is misleading without it.
 *
 * Mirrors the `hardware` / `charsets` arrays and the iteration `<option>`s in
 * `BruteForceCost.astro`, plus `tools.bruteForceCost.*`. There is nothing to
 * derive them from — the component holds them as literals — so they have to
 * be kept in step by hand.
 */
const LABEL = {
  en: {
    heading: "Offline brute-force calculator — built-in presets",
    rateNote:
      "Attacker rate is derived from the raw SHA-256 figure as raw / (2 x PBKDF2 iterations) — two SHA-256 compressions per round.",
    hardware: "Attacker hardware",
    rawSha: "Raw SHA-256",
    alphabets:
      "Secret alphabets: digits (PIN) 10, lowercase + digits 36, letters + digits 62, all printable ASCII 95. Secret length: 3 to 20.",
    iterations:
      "PBKDF2 iteration presets: 35000 (device production), 600000 (OWASP 2025), 1000 (hashcat benchmark).",
    cpu16: "Modern 16-core CPU",
    rig8: "8x RTX 5090 rig",
    cluster: "100x RTX 5090 cluster",
  },
  es: {
    heading: "Calculadora de fuerza bruta offline — valores predefinidos",
    rateNote:
      "El ritmo del atacante se deriva del SHA-256 bruto como bruto / (2 x iteraciones PBKDF2) — dos compresiones SHA-256 por ronda.",
    hardware: "Hardware del atacante",
    rawSha: "SHA-256 bruto",
    alphabets:
      "Alfabetos del secreto: dígitos (PIN) 10, minúsculas + dígitos 36, letras + dígitos 62, todo ASCII imprimible 95. Longitud del secreto: de 3 a 20.",
    iterations:
      "Iteraciones PBKDF2 predefinidas: 35000 (producción del dispositivo), 600000 (OWASP 2025), 1000 (benchmark de hashcat).",
    cpu16: "CPU moderna de 16 núcleos",
    rig8: "Equipo de 8x RTX 5090",
    cluster: "Clúster de 100x RTX 5090",
  },
} as const;

/**
 * Raw SHA-256 throughput in GH/s. Exact for every entry: the component stores
 * H/s (`28_353e6`), and the rig and cluster rows are its literal 8x and 100x
 * multiples of the 5090, so nothing is rounded here.
 */
const HARDWARE: {
  name?: string;
  /** Translated product name, for the three entries that have one. */
  key?: "cpu16" | "rig8" | "cluster";
  ghs: number;
}[] = [
  { name: "NVIDIA RTX 5090", ghs: 28.353 },
  { name: "NVIDIA RTX 4090", ghs: 21.975 },
  { name: "NVIDIA RTX 4080", ghs: 13.7 },
  { name: "NVIDIA RTX 3090", ghs: 9.866 },
  { name: "NVIDIA RTX 3060", ghs: 3.9 },
  { key: "cpu16", ghs: 1.5 },
  { key: "rig8", ghs: 226.824 },
  { key: "cluster", ghs: 2835.3 },
];

export default markdownFor({
  tag: "BruteForceCost",
  toMarkdown(_node, ctx) {
    const label = LABEL[ctx.locale];
    const table = [
      `| ${label.hardware} | ${label.rawSha} |`,
      "| --- | --- |",
      ...HARDWARE.map((item) => {
        const name = item.key ? label[item.key] : (item.name ?? "");
        return `| ${name} | ${item.ghs} GH/s |`;
      }),
    ].join("\n");

    return [
      `**${label.heading}**`,
      table,
      label.rateNote,
      label.alphabets,
      label.iterations,
    ].join("\n\n");
  },
});
