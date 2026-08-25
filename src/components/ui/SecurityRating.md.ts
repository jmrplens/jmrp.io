import { markdownFor } from "@utils/llms/mdx/types";

/**
 * An Observatory-style grade card. The grade itself is one letter in a prop,
 * and the analysis behind it is a 400-character `description` prop — several
 * paragraphs' worth of the post's own conclusion, sitting inside an attribute
 * where dropping the tag would take all of it with it. Post 011's card is the
 * only place that says which residual gaps the design leaves open.
 *
 * The letter is paired with the word the component prints beside it, since
 * "A" alone is only a grade against a scale nothing else in the text states.
 *
 * Kept: grade, its word, title, description, body. Dropped: nothing.
 */
const TEXT = {
  en: {
    rating: "Security rating",
    grade: {
      "A+": "Excellent",
      A: "Very Good",
      B: "Good",
      C: "Acceptable",
      D: "Needs Improvement",
      E: "Poor",
      F: "Critical",
    },
  },
  es: {
    rating: "Calificación de seguridad",
    grade: {
      "A+": "Excelente",
      A: "Muy bueno",
      B: "Bueno",
      C: "Aceptable",
      D: "Necesita mejorar",
      E: "Deficiente",
      F: "Crítico",
    },
  },
} as const;

type Grade = keyof (typeof TEXT)["en"]["grade"];

export default markdownFor({
  tag: "SecurityRating",
  toMarkdown(node, ctx) {
    const words = TEXT[ctx.locale];
    const rating = ctx.attr(node, "rating") ?? "";
    const grade = rating in words.grade ? words.grade[rating as Grade] : "";

    // The component falls back to the grade's word as the heading, so a title
    // equal to it would otherwise be printed twice.
    const title = ctx.attr(node, "title");
    const head = [
      `${words.rating}: ${rating || "—"}`,
      grade && grade !== title ? `(${grade})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const blocks = [title ? `**${head} — ${title}**` : `**${head}**`];

    const description = ctx.attr(node, "description")?.trim();
    if (description) blocks.push(description);

    const body = ctx.body(node);
    if (body.trim() !== "") blocks.push(body);

    return blocks.join("\n\n");
  },
});
