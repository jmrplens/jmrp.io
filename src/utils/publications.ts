import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Cite = require('citation-js'); // Library to parse BibTeX files

/**
 * Represents a group of publications categorized by type (e.g., Journals, Conferences).
 */
export interface PublicationGroup {
    title: string;
    items: any[];
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
 * File location: src/data/_bibliography/papers.bib
 * 
 * Process involves:
 * 1. Reading the .bib file.
 * 2. Parsing entries using citation-js.
 * 3. Sorting by year (descending).
 * 4. Matching authors with the coauthors.yml file to add profile links.
 * 5. Extracting custom fields (slides, poster) that citation-js might miss.
 * 6. Grouping into categories: Journal, Conference, Thesis, Others.
 * 
 * @returns {Promise<PublicationGroup[]>} Structured list of publication groups.
 */
export async function getPublications(): Promise<PublicationGroup[]> {
    try {
        const filePath = path.join(process.cwd(), 'src/data/_bibliography/papers.bib');
        const fileContents = fs.readFileSync(filePath, 'utf8');

        // Load coauthors
        const coauthorsPath = path.join(process.cwd(), 'src/data/coauthors.yml');
        const coauthorsRaw = fs.readFileSync(coauthorsPath, 'utf8');
        const coauthors: Record<string, Coauthor[]> = yaml.load(coauthorsRaw) as any;

        /**
         * Helper to manually extract custom fields from the raw BibTeX string.
         * Used for fields like 'slides' or 'poster' which standard parsers might ignore.
         */
        const extractCustomField = (id: string, field: string): string | null => {
            // Find the specific entry block first to avoid matching fields from subsequent entries
            // Match from @Type{id, until the next @ or end of string. 
            // Note: This relies on entries starting with @ and id being the first token.
            // We use a lookahead for the next @ or end of file.
            const entryRegex = new RegExp(String.raw`@.*?\{${id},([\s\S]*?)(?=\n@|$)`, 'i');
            const entryMatch = entryRegex.exec(fileContents);

            if (!entryMatch) return null;

            const entryBody = entryMatch[1];
            const fieldRegex = new RegExp(String.raw`${field}\s*=\s*\{(.*?)\}`, 'i');
            const fieldMatch = fieldRegex.exec(entryBody);

            return fieldMatch ? fieldMatch[1] : null;
        };

        const citations = new Cite(fileContents);
        const data = citations.data;

        // Sort all by year desc first
        data.sort((a: any, b: any) => {
            const yearA = a.issued?.['date-parts']?.[0]?.[0] || 0;
            const yearB = b.issued?.['date-parts']?.[0]?.[0] || 0;
            return yearB - yearA;
        });

        /**
         * Checks if a given name matches any variation in the coauthor's firstname list.
         */
        const isNameMatch = (bibGiven: string, firstnameVariations: string[]): boolean => {
            return firstnameVariations.some(n =>
                n === bibGiven || n.includes(bibGiven) || bibGiven.includes(n)
            );
        };

        /**
         * Matches bibtex authors against the coauthors.yml list.
         * If a match is found based on family name and first name variation, adds the URL.
         */
        const processAuthors = (authors: any[]) => {
            if (!authors) return [];
            return authors.map((author: any) => {
                const family = author.family;
                if (coauthors[family]) {
                    const bibGiven = author.given || "";
                    const match = coauthors[family].find(c =>
                        isNameMatch(bibGiven, c.firstname)
                    );

                    if (match) {
                        return { ...author, url: match.url };
                    }
                }
                return author;
            });
        };

        // Grouping containers
        const journalArticles: any[] = [];
        const conferencePapers: any[] = [];
        const thesisList: any[] = [];

        /**
         * Extract raw bibtex entry for display/copying
         */
        const extractRawBibtex = (id: string) => {
            const entryRegex = new RegExp(String.raw`@.*?\{${id},[\s\S]*?(?=\n@|$)`, 'i');
            const match = entryRegex.exec(fileContents);
            return match ? match[0].trim() : '';
        };

        for (const item of data) {
            const type = item.type;

            // Manually inject slides/poster if missing
            if (!item.slides) item.slides = extractCustomField(item.id, 'slides');
            if (!item.poster) item.poster = extractCustomField(item.id, 'poster');

            // Extract raw bibtex entry for display/copying
            item.bibtex = extractRawBibtex(item.id);

            // Enrich authors with links
            item.author = processAuthors(item.author);

            if (type === 'article-journal') {
                journalArticles.push(item);
            } else if (type === 'paper-conference' || type === 'chapter') {
                conferencePapers.push(item);
            } else if (type === 'thesis' || type === 'report') {
                thesisList.push(item);
            }
            // Note: Publications with other types are intentionally ignored
        }

        return [
            { title: "Journal articles", items: journalArticles },
            { title: "Conference and workshop papers", items: conferencePapers },
            { title: "Thesis", items: thesisList },
        ].filter(g => g.items.length > 0);
    } catch (error) {
        console.error("Error fetching publications:", error);
        return []; // Return an empty array or rethrow the error, depending on desired error handling
    }
}
