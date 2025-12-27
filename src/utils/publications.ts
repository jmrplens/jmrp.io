import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { getEntry } from "astro:content";

const require = createRequire(import.meta.url);
// Cite is only used in getPublications which runs at build time (SSG)
const Cite = require("citation-js");

/**
 * Represents a group of publications categorized by type (e.g., Journals, Conferences).
 */
export interface PublicationGroup {
  title: string;
  items: PublicationItem[];
}

interface PublicationAuthor {
  given: string;
  family: string;
  url?: string;
}

export interface PublicationItem {
  id: string;
  title: string;
  type: string;
  author: PublicationAuthor[];
  issued?: { "date-parts"?: number[][] };
  "container-title"?: string;
  publisher?: string;
  school?: string;
  institution?: string;
  "container-title-short"?: string;
  url?: string;
  URL?: string;
  doi?: string;
  DOI?: string;
  pdf?: string;
  PDF?: string;
  slides?: string;
  poster?: string;
  abstract?: string;
  bibtex?: string;
}

/**
 * Interface for co-author matching configuration.
 * Used to link author names to their personal websites.
 */
interface Coauthor {
  firstname: string[]; // Variations of the first name to match
  url: string; // URL to the co-author's website
}

/**
 * Fetches, parses, and processes publications from the BibTeX file.
 * File location: src/content/publications/bibliography/papers.bib
 *
 * Process involves:
 * 1. Reading the .bib file.
 * 2. Parsing entries using citation-js.
 * 3. Sorting by year (descending).
 * 4. Matching authors with the publications/coauthors collection to add profile links.
 * 5. Extracting custom fields (slides, poster) that citation-js might miss.
 * 6. Grouping into categories: Journal, Conference, Thesis, Others.
 *
 * @returns {Promise<PublicationGroup[]>} Structured list of publication groups.
 */
export async function getPublications(): Promise<PublicationGroup[]> {
  try {
    const filePath = path.join(
      process.cwd(),
      "src/content/publications/bibliography/papers.bib",
    );
    const fileContents = fs.readFileSync(filePath, "utf8");

    // Load coauthors from content collection
    const coauthorsEntry = await getEntry("publications", "coauthors");
    const coauthors = (coauthorsEntry?.data || {}) as Record<
      string,
      Coauthor[]
    >;

    /**
     * Helper to manually extract custom fields from the raw BibTeX string.
     * Used for fields like 'slides' or 'poster' which standard parsers might ignore.
     */
    const extractCustomField = (id: string, field: string): string | null => {
      // Find the specific entry block first to avoid matching fields from subsequent entries
      const entryRegex = new RegExp(
        String.raw`@.*?\{${id},([\s\S]*?)(?=\n@|$)`,
        "i",
      );
      const entryMatch = entryRegex.exec(fileContents);

      if (!entryMatch) return null;

      const entryBody = entryMatch[1];
      // Match braced content {value} or unbraced value (e.g. true, 2021) up to comma or end of line
      const fieldRegex = new RegExp(
        String.raw`${field}\s*=\s*(?:\{(.*?)\}|([^{},]+))`,
        "i",
      );
      const fieldMatch = fieldRegex.exec(entryBody);

      if (!fieldMatch) return null;
      return (fieldMatch[1] || fieldMatch[2] || "").trim();
    };

    const citations = new Cite(fileContents);
    const data = citations.data as PublicationItem[];

    // Sort all by year desc first
    data.sort((a, b) => {
      const yearA = a.issued?.["date-parts"]?.[0]?.[0] || 0;
      const yearB = b.issued?.["date-parts"]?.[0]?.[0] || 0;
      return yearB - yearA;
    });

    // ... (authors logic kept) ...
    const isNameMatch = (
      bibGiven: string,
      firstnameVariations: string[],
    ): boolean => {
      return firstnameVariations.some(
        (n) => n === bibGiven || n.includes(bibGiven) || bibGiven.includes(n),
      );
    };
    const processAuthors = (authors: PublicationAuthor[]) => {
      if (!authors) return [];
      return authors.map((author) => {
        const family = author.family;
        if (coauthors[family]) {
          const bibGiven = author.given || "";
          const match = coauthors[family].find((c) =>
            isNameMatch(bibGiven, c.firstname),
          );
          if (match) return { ...author, url: match.url };
        }
        return author;
      });
    };

    // Grouping containers
    const journalArticles: PublicationItem[] = [];
    const conferencePapers: PublicationItem[] = [];
    const thesisList: PublicationItem[] = [];

    const extractRawBibtex = (id: string) => {
      const entryRegex = new RegExp(
        String.raw`@.*?\{${id},[\s\S]*?(?=\n@|$)`,
        "i",
      );
      const match = entryRegex.exec(fileContents);
      return match ? match[0].trim() : "";
    };

    for (const item of data) {
      // Filter by bibtex_show
      const bibtexShow = extractCustomField(item.id, "bibtex_show");
      if (bibtexShow && bibtexShow.toLowerCase() !== "true") continue;

      const type = item.type;

      // Manually inject slides/poster/pdf if missing
      if (!item.slides)
        item.slides = extractCustomField(item.id, "slides") || "";
      if (!item.poster)
        item.poster = extractCustomField(item.id, "poster") || "";
      if (!item.pdf) item.pdf = extractCustomField(item.id, "pdf") || "";

      // Extract raw bibtex entry for display/copying
      item.bibtex = extractRawBibtex(item.id);

      // Enrich authors with links
      item.author = processAuthors(item.author);

      if (type === "article-journal") {
        journalArticles.push(item);
      } else if (type === "paper-conference" || type === "chapter") {
        conferencePapers.push(item);
      } else if (type === "thesis" || type === "report") {
        thesisList.push(item);
      }
      // Note: Publications with other types are intentionally ignored
    }

    return [
      { title: "Journal articles", items: journalArticles },
      { title: "Conference and workshop papers", items: conferencePapers },
      { title: "Thesis", items: thesisList },
    ].filter((g) => g.items.length > 0);
  } catch (error) {
    console.error("Error fetching publications:", error);
    return []; // Return an empty array or rethrow the error, depending on desired error handling
  }
}
