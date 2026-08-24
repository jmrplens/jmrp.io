/**
 * Open-source project entities.
 *
 * Loads `src/content/profile/projects.yaml` and turns it into (a) the data the
 * /projects/ page renders and (b) the JSON-LD nodes that attach those projects
 * to the canonical `https://jmrp.io/#person` entity.
 *
 * ── Why the graph is shaped this way ─────────────────────────────────────
 * schema.org has no forward property for "works this Person made" — the
 * vocabulary only defines the reverse edge (`CreativeWork.author/creator/
 * maintainer` → Person). So the authoritative link lives on the software
 * nodes, which each carry all three, and the Person carries `owns` with bare
 * `@id` references so the relation is also traversable from the identity side
 * without duplicating the software descriptions on every page. `owns` is the
 * closest Person→Thing property in the vocabulary (schema-dts types its range
 * as `Thing`), and it is deliberately reference-only: the full nodes are
 * emitted once, on /projects/.
 *
 * Five of these projects already publish their own `#software` node from their
 * documentation site, using this exact @id and `author: { @id: #person }`.
 * Emitting a matching node here is a merge, not a duplicate — which is why the
 * YAML requires `name`/`summary.en` to match those sites verbatim.
 */
import { getSiteUrl } from "@utils/site";
import { wikidataEntityUri, wikidataLabel } from "@utils/wikidata";
import { getEntry } from "astro:content";
import type {
  SoftwareApplication,
  SoftwareSourceCode,
  Thing,
} from "schema-dts";

/** A Wikidata-grounded subject of a project. */
export interface ProjectTopic {
  name: string;
  wikidata: string;
}

/** One project as authored in `projects.yaml`. */
export interface Project {
  id: string;
  name: string;
  status: "active" | "archived";
  schemaType: "SoftwareApplication" | "SoftwareSourceCode";
  applicationCategory?: string;
  applicationSubCategory?: string;
  language: string;
  license: string;
  repo: string;
  docs: string;
  docsEs?: string;
  /** Page documenting a public running instance (see the schema for why it stays out of JSON-LD). */
  hosted?: string;
  hostedEs?: string;
  /** Raw callable MCP endpoint; presence marks the project as part of the fleet (see the schema). */
  endpoint?: string;
  sameAs?: string[];
  topics: ProjectTopic[];
  summary: { en: string; es: string };
}

/**
 * Canonical license URLs per SPDX identifier. `SoftwareApplication.license`
 * takes a URL, and a stable, well-known one lets a consumer resolve the terms
 * without parsing an identifier string.
 */
const LICENSE_URLS: Readonly<Record<string, string>> = {
  MIT: "https://opensource.org/licenses/MIT",
  "GPL-3.0": "https://www.gnu.org/licenses/gpl-3.0.html",
  "AGPL-3.0": "https://www.gnu.org/licenses/agpl-3.0.html",
  "Apache-2.0": "https://www.apache.org/licenses/LICENSE-2.0",
  "BSD-3-Clause": "https://opensource.org/licenses/BSD-3-Clause",
};

/** Resolves an SPDX id to its canonical license URL (identity if unknown). */
export const licenseUrl = (license: string): string =>
  LICENSE_URLS[license] ?? license;

/**
 * The @id every project's software entity is published under — the GitHub
 * repository URL plus a `#software` fragment. This is NOT a fetchable link;
 * it is the shared identifier that lets jmrp.io and each project's own docs
 * site describe the same node.
 *
 * @param project - The project (or its repo name).
 * @returns The canonical `#software` @id.
 */
export const softwareId = (project: Project | string): string =>
  `https://github.com/jmrplens/${typeof project === "string" ? project : project.id}#software`;

/**
 * Localized page for a project's public running instance, or `undefined` when
 * it has none.
 *
 * Lives here rather than in a page because two surfaces render the same link —
 * /projects/ and the featured cards on /about/ — and a second copy of the
 * `hostedEs` fallback is exactly the shape that drifts between locales.
 * Returns the PAGE, never the raw endpoint: the MCP endpoints answer 405 to
 * the GET a browser sends (see the `hosted` field docs in content.config.ts).
 *
 * @param project - The project as authored in `projects.yaml`.
 * @param locale - Current locale; only `es` has a separate page today.
 * @returns The documentation page URL for the running instance, if any.
 */
export const hostedHref = (
  project: Project,
  locale: string,
): string | undefined =>
  locale === "es" && project.hostedEs ? project.hostedEs : project.hosted;

/** Reads and validates the projects document from the content collection. */
export async function getProjects(): Promise<Project[]> {
  const entry = await getEntry("profile", "projects");
  if (!entry) throw new Error("Missing content: profile/projects.yaml");
  if (entry.data.type !== "projects")
    throw new Error("profile/projects.yaml is not type: projects");
  return entry.data.projects;
}

/** A project narrowed to the MCP fleet (its `endpoint` is present). */
export type McpServer = Project & { endpoint: string };

/**
 * The self-hosted MCP fleet, in YAML order: every project that declares a
 * callable `endpoint`. Single source for BaseHead's `owns` @ids, the
 * /homelab/ MCP card and llms.txt — a new server only edits `projects.yaml`
 * (`scripts/ci/build-identity.mjs` reads the same field from the raw YAML).
 */
export async function getMcpServers(): Promise<McpServer[]> {
  return (await getProjects()).filter(
    (project): project is McpServer => typeof project.endpoint === "string",
  );
}

/**
 * The @id of a deployed MCP endpoint's `[WebAPI, SoftwareApplication]` node,
 * canonically published by mcp.jmrp.io (which points back to `#person` via
 * `provider`/`author`). NOT a fetchable link — the shared identifier both
 * sites describe the same node under.
 *
 * @param server - The fleet member (or its raw endpoint URL).
 * @returns The canonical `#api` @id.
 */
export const mcpApiId = (server: McpServer | string): string =>
  `${typeof server === "string" ? server : server.endpoint}#api`;

/**
 * Wikidata's canonical entity concept URI uses a plain, non-secure scheme by
 * design — it is the standard Linked Data identifier, not a fetchable link.
 * Mirrors the treatment of `knowsAbout` in BaseHead.astro.
 *
 * @param topic - The topic to express as a schema.org Thing.
 * @returns A `Thing` node identified by its Wikidata entity URI.
 */
const topicThing = (topic: ProjectTopic): Thing => ({
  "@type": "Thing",
  // The chip on /projects/ keeps the authored spelling; the graph publishes
  // Wikidata's own label so this `@id` agrees with the same `@id` emitted
  // from post topics and from #person.knowsAbout.
  name: wikidataLabel(topic.wikidata, topic.name),
  "@id": wikidataEntityUri(topic.wikidata),
});

/**
 * Builds the JSON-LD node for one project.
 *
 * `description` is always the English summary, on both locales: the software
 * entity is language-neutral and shares its @id with the project's own site,
 * so a per-locale description would fork the node's canonical value.
 *
 * The return type is the structural `Record` that `BaseLayout`'s `schema` prop
 * takes; Schema.org correctness is still enforced by the `satisfies` clauses
 * below, which is where schema-dts does its checking.
 *
 * @param project - The project to describe.
 * @returns A `SoftwareApplication` or `SoftwareSourceCode` node.
 */
export function buildProjectSchema(project: Project): Record<string, unknown> {
  const personRef = { "@id": new URL("#person", getSiteUrl()).href };
  const [about, ...mentions] = project.topics;

  // The docs URL is an identity alias only when it is a separate site.
  // Projects without one point `docs` at the repo README anchor, which is
  // just `url` with a fragment — not a distinct page worth aliasing.
  const aliases = [
    ...(project.docs.startsWith(`${project.repo}#`) ? [] : [project.docs]),
    ...(project.sameAs ?? []),
  ];

  const shared = {
    "@id": softwareId(project),
    name: project.name,
    description: project.summary.en,
    url: project.repo,
    codeRepository: project.repo,
    programmingLanguage: project.language,
    license: licenseUrl(project.license),
    isAccessibleForFree: true,
    author: personRef,
    creator: personRef,
    maintainer: personRef,
    about: topicThing(about),
    ...(mentions.length > 0 && { mentions: mentions.map(topicThing) }),
    ...(aliases.length > 0 && { sameAs: aliases }),
  };

  return project.schemaType === "SoftwareSourceCode"
    ? ({
        "@type": "SoftwareSourceCode",
        ...shared,
      } satisfies SoftwareSourceCode)
    : ({
        "@type": "SoftwareApplication",
        ...shared,
        ...(project.applicationCategory && {
          applicationCategory: project.applicationCategory,
        }),
        ...(project.applicationSubCategory && {
          applicationSubCategory: project.applicationSubCategory,
        }),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      } satisfies SoftwareApplication);
}
