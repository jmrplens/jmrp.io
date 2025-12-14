import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Cite = require('citation-js');

export interface PublicationGroup {
    title: string;
    items: any[];
}

interface Coauthor {
    firstname: string[];
    url: string;
}

export async function getPublications(): Promise<PublicationGroup[]> {
    try {
        const filePath = path.join(process.cwd(), 'src/data/_bibliography/papers.bib');
        const fileContents = fs.readFileSync(filePath, 'utf8');

        // Load coauthors
        const coauthorsPath = path.join(process.cwd(), 'src/data/coauthors.yml');
        const coauthorsRaw = fs.readFileSync(coauthorsPath, 'utf8');
        const coauthors: Record<string, Coauthor[]> = yaml.load(coauthorsRaw) as any;

        const extractCustomField = (id: string, field: string): string | null => {
            // Find the specific entry block first to avoid matching fields from subsequent entries
            // Match from @Type{id, until the next @ or end of string. 
            // Note: This relies on entries starting with @ and id being the first token.
            // We use a lookahead for the next @ or end of file.
            const entryRegex = new RegExp(`@.*?\\{${id},([\\s\\S]*?)(?=\\n@|$)`, 'i');
            const entryMatch = fileContents.match(entryRegex);

            if (!entryMatch) return null;

            const entryBody = entryMatch[1];
            const fieldRegex = new RegExp(`${field}\\s*=\\s*\\{(.*?)\\}`, 'i');
            const fieldMatch = entryBody.match(fieldRegex);

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

        const processAuthors = (authors: any[]) => {
            if (!authors) return [];
            return authors.map((author: any) => {
                const family = author.family;
                if (coauthors[family]) {
                    const match = coauthors[family].find(c => {
                        return c.firstname.some(n => {
                            const bibGiven = author.given || "";
                            return n === bibGiven || n.includes(bibGiven) || bibGiven.includes(n);
                        });
                    });

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
        const others: any[] = [];

        for (const item of data) {
            const type = item.type;

            // Manually inject slides/poster if missing
            if (!item.slides) item.slides = extractCustomField(item.id, 'slides');
            if (!item.poster) item.poster = extractCustomField(item.id, 'poster');

            // Extract raw bibtex entry
            const extractRawBibtex = (id: string) => {
                const entryRegex = new RegExp(`@.*?\\{${id},[\\s\\S]*?(?=\\n@|$)`, 'i');
                const match = fileContents.match(entryRegex);
                return match ? match[0].trim() : '';
            };
            item.bibtex = extractRawBibtex(item.id);

            // Enrich authors with links
            item.author = processAuthors(item.author);

            if (type === 'article-journal') {
                journalArticles.push(item);
            } else if (type === 'paper-conference' || type === 'chapter') {
                conferencePapers.push(item);
            } else if (type === 'thesis' || type === 'report') {
                thesisList.push(item);
            } else {
                others.push(item);
            }
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
