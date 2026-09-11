/**
 * Question-and-answer pairs for the pages that carry no frontmatter of their
 * own, read from the `page_faq` collection and, for the tool category pages,
 * assembled from the `<cat>Context` string the category page already shows.
 *
 * One reader for three surfaces: the visible FAQ section, the FAQPage node in
 * the page's @graph and the "Questions answered:" block of the markdown twin.
 * Posts and tools have the same three, fed from their own frontmatter; these
 * twenty pages had none of them until GEO audit #8, and in the seven days
 * before it no answer engine fetched a single one of their twins.
 *
 * @module
 */
import type { Locale } from "@i18n/config";
import { type TranslationKey, useTranslations } from "@i18n/utils";
import { getEntry } from "astro:content";
import type { FAQPage } from "schema-dts";

import { CATEGORY_ORDER, categoryName } from "./llms/tool-categories";

/** One question with its answer, as the page states it. */
export interface FaqItem {
  question: string;
  answer: string;
}

/** A page's pairs and whether the page renders them. */
export interface PageFaq {
  /** Whether the HTML page shows the section. The twin and the graph always carry it. */
  visible: boolean;
  items: FaqItem[];
}

/**
 * The question a category page answers about its tools, per locale. The
 * category name already says "Tools" ("Security Tools", "Herramientas de
 * seguridad"), so the question wraps it rather than repeating the word.
 */
const CATEGORY_QUESTION = {
  en: (name: string) => `What do the ${name} on jmrp.io do?`,
  es: (name: string) =>
    `¿Qué hacen las ${name.charAt(0).toLowerCase()}${name.slice(1)} de jmrp.io?`,
} as const;

/** Heading of the twin's block; shared with posts and tools in `llms.ts`. */
const QUESTIONS_HEADING = {
  en: "Questions answered:",
  es: "Preguntas que responde:",
} as const;

/**
 * The pairs for one page, or undefined when the page declares none.
 *
 * @param path - Locale-stripped path with both slashes, e.g. `/about/`.
 * @param locale - Locale of the page.
 * @returns The page's pairs and visibility.
 */
export async function getPageFaq(
  path: string,
  locale: Locale,
): Promise<PageFaq | undefined> {
  // Category pages: one pair each, whose answer IS the context paragraph the
  // page already renders, so the pair cannot say something the page does not.
  // Not visible: a listing page shows the paragraph itself, and the pair is
  // the same words under a question, which is what the twin and the graph
  // want and a reader does not.
  const category = /^\/tools\/categories\/([a-z]+)\/$/.exec(path)?.[1];
  if (category) {
    if (!(CATEGORY_ORDER as readonly string[]).includes(category))
      return undefined;
    const t = useTranslations(locale);
    return {
      visible: false,
      items: [
        {
          question: CATEGORY_QUESTION[locale](categoryName(t, category)),
          answer: t(`pages.toolsCategory.${category}Context` as TranslationKey),
        },
      ],
    };
  }

  const entry = await getEntry("page_faq", locale);
  const page = entry?.data.pages.find((p) => p.path === path);
  return page ? { visible: page.visible, items: page.items } : undefined;
}

/**
 * The FAQPage node for a page's @graph, the same shape BlogPost.astro emits.
 *
 * @param faq - The page's pairs.
 * @param pageUrl - Absolute URL of the page.
 * @param isPartOf - `@id` of the page's own node, which the FAQ hangs off.
 * @param locale - Locale of the answers.
 * @returns The node, ready to append to the schema array.
 */
export function pageFaqNode(
  faq: PageFaq,
  pageUrl: string,
  isPartOf: string,
  locale: Locale,
): Record<string, unknown> {
  // Typed against schema-dts here, returned as the plain record BaseLayout's
  // `schema` prop takes, so every page can append it with `[...].flat()`.
  const node = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    inLanguage: locale,
    isPartOf: { "@id": isPartOf },
    mainEntity: faq.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  } satisfies FAQPage;
  return node;
}

/**
 * The twin's block: every question in bold with its answer under it, in the
 * exact format the post and tool twins use, so a consumer parses one shape.
 *
 * @param faq - The page's pairs, or undefined for none.
 * @param locale - Locale, which picks the heading.
 * @returns The lines to append, or none.
 */
export function pageFaqLines(
  faq: PageFaq | undefined,
  locale: Locale,
): string[] {
  if (!faq || faq.items.length === 0) return [];
  return [
    "",
    QUESTIONS_HEADING[locale],
    "",
    ...faq.items.flatMap((f) => [`**${f.question}**`, "", f.answer, ""]),
  ];
}
