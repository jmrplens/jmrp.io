/**
 * Static BibTeX export route — serves the full bibliography at
 * `/publications.bib` so the Publications page "Export" action can offer a
 * one-click download of every entry.
 */
import fs from "node:fs";
import path from "node:path";

import type { APIRoute } from "astro";

/**
 * Serves the raw BibTeX bibliography as a downloadable attachment.
 *
 * @returns A `Response` streaming `papers.bib` with a download disposition.
 */
export const GET: APIRoute = () => {
  const bibPath = path.join(
    process.cwd(),
    "src/content/publications_data/papers.bib",
  );
  const body = fs.readFileSync(bibPath, "utf8");
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": 'attachment; filename="requena-plens.bib"',
    },
  });
};
