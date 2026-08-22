import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";
import { load } from "js-yaml";

/**
 * Generates `nginx/docs_redirects.conf`: stable `/docs/<project-id>` URLs on
 * jmrp.io that 301 to each project's real documentation site.
 *
 * Why these exist (author's call, 2026-08-22): the `homepage` field of every
 * GitHub repo pointed at `jmrplens.github.io/...`, so the canonical domain
 * appeared nowhere on the project fiches that repos, scrapes and AI citations
 * surface. Pointing `homepage` straight at `jmrp.io/projects/` would have
 * sacrificed the direct path to the docs — the one thing a repo visitor wants.
 * A redirect keeps both: the visible URL carries the canonical domain (what
 * entity resolution feeds on — mentions, not link equity, which follows the
 * redirect to its destination), and the visitor still lands on the docs.
 *
 * Derived from `projects.yaml` on every build, same pattern as
 * `blog_redirects.conf`: adding a project needs no nginx edit. Written to the
 * repo, not to dist/ — dist is the public blue/green symlink and a build from
 * an older revision would leave the vhost include dangling.
 */
const MAP_VARIABLE = "$project_docs_redirect";

/** Shape of the fields this step reads from a `projects.yaml` entry. */
interface ProjectDocsEntry {
  id?: string;
  docs?: string;
}

/**
 * Writes the docs-redirect map for every project that declares a `docs` URL.
 *
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generateDocsRedirects(
  logger: AstroIntegrationLogger,
): Promise<void> {
  const yamlPath = path.join(
    process.cwd(),
    "src/content/profile/projects.yaml",
  );
  const raw = load(fs.readFileSync(yamlPath, "utf8")) as
    | ProjectDocsEntry[]
    | { projects?: ProjectDocsEntry[]; items?: ProjectDocsEntry[] };
  const items = Array.isArray(raw) ? raw : (raw.projects ?? raw.items ?? []);

  const pairs = items
    .filter(
      (p): p is Required<ProjectDocsEntry> =>
        typeof p.id === "string" && typeof p.docs === "string",
    )
    .map((p) => [`/docs/${p.id}`, p.docs] as const);

  const entries = pairs
    .flatMap(([from, to]) => [
      `    "${from}"  "${to}";`,
      `    "${from}/"  "${to}";`,
    ])
    .join("\n");

  const content = `# GENERATED FILE — DO NOT EDIT.
# Written by src/integrations/post-build/docs-redirects.ts on every build,
# derived from src/content/profile/projects.yaml.
#
# Stable documentation URLs under the canonical domain: /docs/<project-id>
# 301s to the project's real docs site. Repo \`homepage\` fields point here so
# the canonical domain travels with every project fiche while the visitor
# still lands on the docs. If a docs site ever moves, edit projects.yaml and
# rebuild — one place, all consumers.
#
# Included at http level; consumed by the server block as:
#     if (${MAP_VARIABLE}) { return 301 ${MAP_VARIABLE}; }
#
# Projects: ${pairs.length} (x2 for the trailing-slash form)

map $uri ${MAP_VARIABLE} {
    default "";

${entries}
}
`;

  const outPath = path.join(process.cwd(), "nginx", "docs_redirects.conf");
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, content);
  logger.info(
    `  ✓ Generated nginx/docs_redirects.conf (${pairs.length} project docs redirects)`,
  );
}
