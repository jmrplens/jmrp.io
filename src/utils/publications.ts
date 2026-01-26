import fs from "node:fs";
import path from "node:path";

import { getEntry } from "astro:content";
import Cite from "citation-js"; // Library to parse BibTeX files

/**
 * Represents a single publication entry with its metadata.
 */
export interface PublicationItem {
  /** Unique ID of the publication (citation key). */
  id: string;
  /** Type of publication (e.g., 'article-journal', 'paper-conference'). */
  type: string;
  /** Title of the publication. */
  title: string;
  /** List of authors. */
  author?: { family: string; given?: string; url?: string }[];
  /** Date information, typically including year. */
  issued?: { "date-parts": number[][] };
  /** Allow arbitrary additional properties from CSL JSON. */
  [key: string]: unknown;
}

/**
 * Represents a group of publications categorized by type (e.g., Journals, Conferences).
 */
export interface PublicationGroup {
  /** Title of the group (e.g. "Journal Articles"). */
  title: string;
  /** List of publications in this group. */
  items: PublicationItem[];
}

/**
 * Metadata for a co-author, including their name variations and profile link.
 */
interface Coauthor {
  /** List of first names or initials to match against. */
  firstname: string[];
  /** URL to the co-author's profile. */
  url: string;
}

/**
 * Map of co-author family names to their respective details.
 */
interface CoauthorMap {
  /** Mapping of family name to co-author details. */
  [family: string]: Coauthor[];
}

/**
 * Fetches, parses, and processes publications from the BibTeX file.
 * File location: src/data/publications/bibliography/papers.bib
 *
 * Process involves:
 * - Reading the .bib file.
 * - Parsing entries using citation-js.
 * - Sorting by year (descending).
 * - Matching authors with the coauthors.yml file to add profile links.
 * - Extracting custom fields (slides, poster) that citation-js might miss.
 * - Grouping into categories: Journal, Conference, Thesis, Others.
 *
 * @returns {Promise<PublicationGroup[]>} Structured list of publication groups.
 */
export async function getPublications(): Promise<PublicationGroup[]> {
  try {
    const filePath = path.join(
      process.cwd(),
      "src/content/publications_data/papers.bib",
    );
    const fileContents = await fs.promises.readFile(filePath, "utf-8");

    const coauthorsEntry = await getEntry("publications_data", "coauthors");
    const coauthors = (coauthorsEntry?.data || {}) as CoauthorMap;

    /**
     * Helper to manually extract custom fields from the raw BibTeX string.
     * Used for fields like 'slides' or 'poster' which standard parsers might ignore.
     *
     * @param id - The publication ID.
     * @param field - The field name to extract.
     * @returns The field value or null if not found.
     */
    const extractCustomField = (id: string, field: string): string | null => {
      const escapeRegExp = (string: string) => {
        return string.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"); // eslint-disable-line
      };

      // Find the specific entry block first to avoid matching fields from subsequent entries
      const escapedId = escapeRegExp(id);
      const entryRegex = new RegExp(
        String.raw`@.*?\{${escapedId},([\s\S]*?)(?=\n@|$)`,
        "i",
      );
      const entryMatch = entryRegex.exec(fileContents);

      if (!entryMatch) return null;

      const entryBody = entryMatch[1];
      const escapedField = escapeRegExp(field);
      // Match braced content {value} or unbraced value (e.g. true, 2021) up to comma or end of line
      const fieldRegex = new RegExp(
        String.raw`${escapedField}\s*=\s*(?:\{(.*?)\}|([^{},]+))`,
        "i",
      );
      const fieldMatch = fieldRegex.exec(entryBody);

      if (!fieldMatch) return null;
      return (fieldMatch[1] || fieldMatch[2] || "").trim();
    };

    type CiteStatic = new (content: string) => { data: PublicationItem[] };
    const citations = new (Cite as unknown as CiteStatic)(fileContents);
    const data = citations.data;

    data.sort((a, b) => {
      const yearA = a.issued?.["date-parts"]?.[0]?.[0] || 0;
      const yearB = b.issued?.["date-parts"]?.[0]?.[0] || 0;
      return yearB - yearA;
    });

    /**
     * Determines if a given name matches any of the provided firstname variations.
     *
     * @param bibGiven - The given name from the BibTeX entry.
     * @param firstnameVariations - List of possible firstname variations for a co-author.
     * @returns True if a match is found.
     */
    const isNameMatch = (
      bibGiven: string,
      firstnameVariations: string[],
    ): boolean => {
      // Normalize: strip trailing dot if present, e.g., "J." -> "J"
      const normalized = bibGiven.replace(/\.$/, "");

      // Treat single-character normalized bibGiven (initial) strictly
      if (normalized.length === 1) {
        const initial = normalized.toLowerCase();
        return firstnameVariations.some((variation) => {
          const v = variation.toLowerCase();
          // Match only exact initial forms (e.g., "J" or "J.")
          // Don't match full names starting with the initial
          return v === initial || v === initial + ".";
        });
      }

      // Existing loose matching for longer names
      return firstnameVariations.some(
        (n) => n === bibGiven || n.includes(bibGiven) || bibGiven.includes(n),
      );
    };

    /**
     * Enriches an array of authors with profile URLs from the co-authors map.
     *
     * @param authors - Array of author objects.
     * @returns Enriched array of authors.
     */
    const processAuthors = (
      authors: { family: string; given?: string; url?: string }[] | undefined,
    ) => {
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

    const journalArticles: PublicationItem[] = [];
    const conferencePapers: PublicationItem[] = [];
    const thesisList: PublicationItem[] = [];
    const otherPublications: PublicationItem[] = [];

    /**
     * Extracts the raw BibTeX entry string for a specific publication ID.
     *
     * @param id - The publication ID.
     * @returns The raw BibTeX entry string.
     */
    const extractRawBibtex = (id: string) => {
      const escapeRegExp = (string: string) => {
        return string.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"); // eslint-disable-line
      };
      const escapedId = escapeRegExp(id);
      const entryRegex = new RegExp(
        String.raw`@.*?\{${escapedId},[\s\S]*?(?=\n@|$)`,
        "i",
      );
      const match = entryRegex.exec(fileContents);
      return match ? match[0].trim() : "";
    };

    /**
     * Processes a single publication item, performing filtering, enrichment, and categorization.
     *
     * @param item - The item to process.
     */
    const processItem = (item: PublicationItem) => {
      // Filter by bibtex_show
      const bibtexShow = extractCustomField(item.id, "bibtex_show");
      if (bibtexShow && bibtexShow.toLowerCase() !== "true") return;

      const type = item.type;

      // Manually inject slides/poster/pdf if missing
      item.slides =
        (item.slides as string) ?? extractCustomField(item.id, "slides");
      item.poster =
        (item.poster as string) ?? extractCustomField(item.id, "poster");
      item.pdf = (item.pdf as string) ?? extractCustomField(item.id, "pdf");

      // Extract raw bibtex entry for display/copying
      item.bibtex = extractRawBibtex(item.id);

      // Enrich authors with links
      item.author = processAuthors(item.author);

      switch (type) {
        case "article-journal": {
          journalArticles.push(item);

          break;
        }
        case "paper-conference":
        case "chapter": {
          conferencePapers.push(item);

          break;
        }
        case "thesis":
        case "report": {
          thesisList.push(item);

          break;
        }
        default: {
          otherPublications.push(item);
          break;
        }
      }
    };

    data.forEach(processItem);

    return [
      { title: "Journal articles", items: journalArticles },
      { title: "Conference and workshop papers", items: conferencePapers },
      { title: "Thesis", items: thesisList },
      { title: "Other", items: otherPublications },
    ].filter((g) => g.items.length > 0);
  } catch (error) {
    console.error("Error fetching publications:", error);
    return [];
  }
}
