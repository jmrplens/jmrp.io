import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

import { stripExtension } from "./utils/content";

/**
 * Configuration for 'posts' content collection.
 * Defines the schema for blog posts (MDX files).
 */
const posts = defineCollection({
  loader: glob({
    // Note: "**/[^_]*.{md,mdx}" intentionally excludes files starting with "_"
    // so underscore-prefixed Markdown/MDX files (e.g. partials) are not loaded into this collection.
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/posts",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      slug: z
        .string()
        .regex(
          /^\d{3}-/,
          "Slug must start with a three-digit prefix (e.g. 009-my-post)",
        ),
      /** Content language. Defaults to "en" when omitted from frontmatter. */
      lang: z.enum(["en", "es"]).default("en"),
      publishedDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      // Pins this post as the blog index hero. If none is flagged, the most
      // recent post is used as the fallback.
      featured: z.boolean().default(false),
      description: z.string().optional(),
      /**
       * The visible subtitle under the H1, when it should differ from
       * `description`.
       *
       * These two used to be the same string: the meta description was
       * rendered as the lead paragraph. They pull in opposite directions.
       * `description` is written for the SERP — under 155 characters,
       * descriptive, listing what the article covers. The lead is inside
       * `speakable`, so it is an explicit extraction target for voice
       * assistants and AI answers, and a description-style topic label
       * ("Deep dive into QUIC and HTTP/3 — technical architecture, security
       * features…") gives an answer engine nothing to quote because it makes
       * no claim.
       *
       * Use a self-contained declarative sentence, ideally carrying the
       * article's most concrete number. Falls back to `description` when
       * absent, so posts that have not been rewritten keep working.
       */
      lead: z.string().optional(),
      author: z.string().optional(),
      authorEmail: z.email().optional(),
      coverImage: image().optional(),
      tags: z.array(z.string()).default([]),
      /**
       * Schema.org primary type for the post. Use "TechArticle" for engineering
       * guides/tutorials (more specific, AI-recognized) and "BlogPosting" for
       * narrative posts. Defaults to "BlogPosting".
       */
      articleType: z
        .enum(["BlogPosting", "TechArticle"])
        .default("BlogPosting"),
      /** Difficulty hint emitted on TechArticle (`proficiencyLevel`). */
      proficiencyLevel: z
        .enum(["Beginner", "Intermediate", "Expert"])
        .optional(),
      /**
       * Canonical topics for JSON-LD `about`/`mentions`, linked to Wikidata.
       * The first entry becomes `about` (primary topic); the rest `mentions`.
       * `wikidata` is the bare Q-id (e.g. "Q1133706"); verify it resolves to the
       * intended entity — a wrong Q-id is worse than none.
       */
      topics: z
        .array(
          z.object({
            name: z.string().min(1),
            wikidata: z
              .string()
              .regex(/^Q\d+$/, "wikidata must be a bare Q-id, e.g. Q1128636"),
          }),
        )
        .optional(),
      /**
       * FAQ pairs. Rendered as a visible accessible FAQ section AND emitted as
       * FAQPage JSON-LD — single source of truth. Only add genuine Q&A.
       */
      faq: z
        .array(
          z.object({
            question: z.string().min(1),
            answer: z.string().min(1),
          }),
        )
        .optional(),
      /**
       * HowTo schema for step-by-step guides. Emitted as a secondary `HowTo`
       * graph node (strong AI-assistant signal; the visible steps already live
       * in the post body). `anchor` links a step to its in-page section id.
       */
      howto: z
        .object({
          name: z.string(),
          totalTime: z.string().optional(), // ISO 8601 duration, e.g. PT30M
          tools: z.array(z.string()).optional(),
          supplies: z.array(z.string()).optional(),
          steps: z.array(
            z.object({
              name: z.string(),
              text: z.string(),
              anchor: z.string().optional(),
            }),
          ),
        })
        .optional(),
      /**
       * When the instructions were last re-tested, and against what versions.
       * Distinct from `updatedDate`, which also covers typo/prose fixes with
       * no re-verification behind them. Only set this when a re-test actually
       * happened — an invented date turns a trust signal into a checkable lie.
       */
      lastVerified: z
        .object({
          date: z.coerce.date(),
          versions: z.array(z.string()).default([]),
        })
        .optional(),
    }),
});

/**
 * Configuration for 'site_config' collection.
 * Includes general site settings and social media information.
 */
const site_config = defineCollection({
  loader: glob({
    pattern: "**/*.yaml",
    base: "./src/content/site_config",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.discriminatedUnion("type", [
    /**
     * Site Config Schema (site.yaml)
     * Core site metadata: title, description, navigation, hero section.
     */
    z.object({
      type: z.literal("site"),
      title: z.string(),
      description: z.string(),
      author: z.string(),
      url: z.url(),
      keywords: z.string(),
      fediverse_creator: z.string(),
      locale: z.string(),
      name: z.string().optional(),
      jobTitle: z.string().optional(),
      social: z
        .array(
          z.object({
            link: z.string(),
            icon: z.string().optional(),
            label: z.string().optional(),
          }),
        )
        .optional(),
      // Person schema defaults for JSON-LD
      person: z
        .object({
          name: z.string(),
          /**
           * Observed name variants (handle, citation forms, ASCII folds)
           * emitted as Person `alternateName`. Multi-valued: schema.org places
           * no cardinality limit on it, and each spelling is a real alias an
           * index may hold. Only add forms seen in the wild.
           */
          alternateName: z.array(z.string()).min(1).optional(),
          jobTitle: z.string(),
          worksFor: z
            .object({
              name: z.string(),
              url: z.url().optional(),
            })
            .optional(),
          // Additional canonical entity URLs for JSON-LD `sameAs` that should NOT
          // appear as footer social icons (e.g. Google Scholar, ORCID, ResearchGate).
          // Merged with `social_links` to build the full Person `sameAs` array.
          sameAs: z.array(z.url()).optional(),
          // Topics emitted as Person `knowsAbout` on every page, so single-page
          // AI crawls still see the entity's expertise profile.
          knowsAbout: z.array(z.string()).optional(),
        })
        .optional(),
      // Social links for JSON-LD sameAs and dynamic rendering
      social_links: z
        .array(
          z.object({
            name: z.string(),
            url: z.url(),
            icon: z.string().optional(),
            rel: z.string().optional(),
          }),
        )
        .optional(),
      // 'type' is now the discriminator, removing the generic string field if it was meant for something else,
      // but based on context 'type: "site"' is what we want.
      // If the original 'type' field held other data, we'd need to rename the discriminator,
      // but usually 'type' works well. The original file had `type: z.string()` in the first object.
      theme_color: z.string(),
      background_color: z.string().optional(),
      nav: z.array(z.object({ label: z.string(), href: z.string() })),
      hero: z.object({
        title: z.string(),
        subtitle: z.string(),
        bio: z.array(z.string()),
      }),
      featured_projects: z.array(z.string()).optional(),
      // Language-neutral technical facts shown in the homepage hero "whoami"
      // terminal. Localized copy (e.g. `role`) stays in the i18n layer; these
      // are data, not prose, so they live here (like `sameAs`).
      terminal: z
        .object({
          focus: z.string(),
          base: z.string(),
        })
        .optional(),
      shortcuts: z
        .array(
          z.object({
            name: z.string(),
            url: z.string(),
            description: z.string().optional(),
          }),
        )
        .optional(),
    }),
    /**
     * Socials Config Schema (socials.yaml)
     * Social media usernames and custom social links.
     */
    z.object({
      type: z.literal("socials"),
      github_username: z.string().optional(),
      linkedin_username: z.string().optional(),
      mastodon_username: z.string().optional(),
      bluesky_handle: z.string().optional(),
      scholar_userid: z.string().optional(),
      orcid_id: z.string().optional(),
      matrix_id: z.string().optional(),
      work_url: z.url().optional(),
      custom_social: z
        .array(
          z.object({
            title: z.string(),
            url: z.url(),
            icon: z.string().optional(),
            icon_name: z.string().optional(),
            icon_light: z.string().optional(),
            icon_dark: z.string().optional(),
            rel: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ]),
});

/**
 * A URL restricted to safe schemes (http/https/mailto) or root-relative paths,
 * since these values are later rendered as `href`.
 */
const safeUrl = z
  .string()
  .refine(
    (u) =>
      !u.startsWith("//") &&
      (/^(https?:|mailto:)/i.test(u) || u.startsWith("/")),
    "URL must be http(s), mailto:, or a root-relative path (no //host)",
  );

/**
 * Generic CV link. `kind` tags contact links in `basics`; `ariaLabel`
 * disambiguates links with the same visible text.
 */
const CVLink = z.object({
  label: z.string(),
  url: safeUrl,
  kind: z.string().optional(),
  ariaLabel: z.string().optional(),
});

/** An organization/entity (with optional short name + URL). */
const CVOrg = z.object({
  name: z.string(),
  short: z.string().optional(),
  url: safeUrl.optional(),
});

/**
 * ATS-generator hints (ignored by the website). Control the concise ("normal")
 * ATS profile: whether the item/section appears, and condensed org/summary/bullets.
 */
const CVAts = z.object({
  normal: z.boolean().optional(),
  org: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

/** A grouped list of publications embedded under an experience/education entry. */
const CVPubGroup = z.object({
  heading: z.string(),
  items: z.array(z.string()),
});

/** Header / identity block (name, headline, contact, profile summary). */
const CVBasics = z.object({
  name: z.string(),
  headline: z.string(),
  location: z.string(),
  availability: z.string().optional(),
  email: z.string().optional(),
  /** Profile summary (inline markdown). */
  profile: z.string(),
  links: z.array(CVLink),
  /**
   * Job-search target role categories shown as chips in the CV sidebar.
   * These are NOT claimed positions — they describe the roles the author
   * is actively targeting (e.g. ["Firmware", "Software", "QA"]).
   */
  objetivo: z.array(z.string()).optional(),
  /**
   * Language proficiencies shown in the CV sidebar.
   * `level` should be written in the locale's own language (e.g. "Nativo").
   */
  idiomas: z
    .array(z.object({ name: z.string(), level: z.string() }))
    .optional(),
});

/** A downloadable CV file within a download format group. */
const CVDownloadFile = z.object({
  lang: z.string(),
  label: z.string(),
  url: safeUrl,
  download: z.string(),
});

/** A CV download format group (e.g. ATS concise / ATS full / Design). */
const CVDownload = z.object({
  format: z.string(),
  note: z.string().optional(),
  recommended: z.boolean().optional(),
  files: z.array(CVDownloadFile),
});

/** Common fields for chronological entries (text fields are inline markdown). */
const CVChronoBase = {
  org: z.array(CVOrg),
  department: CVOrg.optional(),
  location: z.string().optional(),
  period: z.union([z.string(), z.number()]).optional(),
  summary: z.string().optional(),
  notes: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
  pubGroups: z.array(CVPubGroup).optional(),
  links: z.array(CVLink).optional(),
  ats: CVAts.optional(),
};

/** An experience (job/role) entry. */
const CVExperienceItem = z.object({ role: z.string(), ...CVChronoBase });

/** An education entry (adds downloads for diplomas/transcripts). */
const CVEducationItem = z.object({
  degree: z.string(),
  ...CVChronoBase,
  documents: z.array(CVLink).optional(),
});

/** An individual skill or tool. */
const CVSkillItem = z.object({
  name: z.string(),
  icon: z.string().optional(),
  level: z.number().optional(),
  note: z.string().optional(),
});

/** A grouped collection of skills. */
const CVSkillGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVSkillItem),
});

/** A featured open-source / portfolio project. */
const CVProjectItem = z.object({
  name: z.string(),
  tech: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  links: z.array(CVLink).optional(),
  ats: CVAts.optional(),
});

/** A certificate or award. */
const CVCertificateItem = z.object({
  name: z.string(),
  school: z.string().optional(),
  hours: z.string().optional(),
  url: safeUrl.optional(),
  ariaLabel: z.string().optional(),
});

/** A grouped collection of certificates. */
const CVCertificateGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVCertificateItem),
});

/** CV body sections, discriminated by an explicit `kind`. */
const CVSection = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("experience"),
    title: z.string(),
    items: z.array(CVExperienceItem),
    ats: CVAts.optional(),
  }),
  z.object({
    kind: z.literal("education"),
    title: z.string(),
    items: z.array(CVEducationItem),
    ats: CVAts.optional(),
  }),
  z.object({
    kind: z.literal("skills"),
    title: z.string(),
    groups: z.array(CVSkillGroup),
    ats: CVAts.optional(),
  }),
  z.object({
    kind: z.literal("projects"),
    title: z.string(),
    items: z.array(CVProjectItem),
    ats: CVAts.optional(),
  }),
  z.object({
    kind: z.literal("certificates"),
    title: z.string(),
    groups: z.array(CVCertificateGroup),
    ats: CVAts.optional(),
  }),
]);

/**
 * Configuration for 'cv' data collection.
 * Each locale file (`{es,en}.yaml`) is one document: a header (`basics`),
 * downloadable PDFs (`downloads`), and the CV body (`sections`).
 */
const cv = defineCollection({
  loader: glob({
    pattern: "**/*.yaml",
    base: "./src/content/cv",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.object({
    basics: CVBasics,
    downloads: z.array(CVDownload),
    sections: z.array(CVSection),
  }),
});

/**
 * Configuration for 'publications_data' collection.
 * Stores co-author mapping and other publication-related metadata.
 */
const publications_data = defineCollection({
  loader: glob({
    pattern: "**/*.yaml",
    base: "./src/content/publications_data",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.record(
    z.string(),
    z.array(
      z.object({
        firstname: z.array(z.string()),
        url: z.url(),
      }),
    ),
  ),
});

/**
 * Configuration for 'tools' content collection.
 * Defines the schema for interactive tool pages (MDX files).
 */
const tools = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.mdx",
    base: "./src/content/tools",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    /** Content language. Defaults to "en" when omitted from frontmatter. */
    lang: z.enum(["en", "es"]).default("en"),
    description: z.string(),
    subtitle: z.string().optional(),
    icon: z.string(),
    category: z.enum([
      "security",
      "developer",
      "network",
      "embedded",
      "mikrotik",
    ]),
    tags: z.array(z.string()).default([]),
    // No `appComponent`/`appProps` here: since the per-tool CSS split
    // (2026-08-22) the MDX imports its own app and passes its own props, so a
    // frontmatter copy of that name could only ever drift out of sync. The one
    // consumer left — sitemap-post-dates.ts, which folds the app component's
    // git date into the tool's <lastmod> — reads the MDX import statement
    // itself, which is the single source of truth.
    publishedDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    /**
     * FAQ pairs for the tool. Rendered as a visible accessible FAQ section AND
     * emitted as FAQPage JSON-LD — single source of truth. Only genuine Q&A.
     */
    faq: z
      .array(
        z.object({
          question: z.string().min(1),
          answer: z.string().min(1),
        }),
      )
      .optional(),
    /**
     * Short feature bullets for the tool, emitted as SoftwareApplication
     * `featureList` JSON-LD to give AI engines a richer capability description.
     */
    features: z.array(z.string()).optional(),
  }),
});

/**
 * Configuration for the 'profile' collection (About / Uses pages).
 * Each YAML file is one document, discriminated by `type`. Bilingual prose is
 * kept in `en`/`es` blocks so each page is a single localized source of truth.
 */
const LocalizedString = z.object({ en: z.string(), es: z.string() });

const AboutLocale = z.object({
  kicker: z.string(),
  title: z.string(),
  lead: z.array(z.string()),
  note: z.string(),
  labels: z.object({
    build: z.string(),
    writesAbout: z.string(),
    projects: z.string(),
    education: z.string(),
    contact: z.string(),
  }),
  build: z.array(z.string()),
  writesAbout: z.array(z.string()),
  education: z.array(
    z.object({
      degree: z.string(),
      org: z.string(),
      year: z.string(),
      note: z.string(),
    }),
  ),
});

const aboutSchema = z.object({
  type: z.literal("about"),
  /** Project names curated from the CV's "Open Source Projects" section. */
  featuredProjects: z.array(z.string()),
  person: z.object({
    jobTitle: LocalizedString,
    description: LocalizedString,
    knowsAbout: z.array(z.string()),
    /**
     * Machine-readable contact emitted as Person `email`. Already public in
     * `public/.well-known/security.txt`; the visible address stays obfuscated.
     */
    email: z.email().optional(),
    /**
     * The profession, emitted as `hasOccupation`. Deliberately separate from
     * `worksFor` (site.yaml), which reads as present tense — the canonical
     * entity must not claim a current employer it no longer has.
     */
    occupation: LocalizedString.optional(),
    /**
     * Languages emitted as `knowsLanguage`. `code` is a BCP-47 tag. schema.org
     * has no proficiency property, so fluency is expressed by order only,
     * never invented as a field.
     */
    knowsLanguage: z
      .array(z.object({ name: z.string(), code: z.string() }))
      .optional(),
    /** City-level home location emitted as `homeLocation`; no street address. */
    homeLocation: z
      .object({
        locality: z.string(),
        region: z.string().optional(),
        country: z.string(),
      })
      .optional(),
  }),
  en: AboutLocale,
  es: AboutLocale,
});

/** One entry in a Uses group. `href` is optional and, per the "only mine"
 * link policy, is only set on the author's own projects/services (paths like
 * `/homelab/` are localized at render; full URLs are used verbatim). */
const UsesItem = z.object({
  name: z.string(),
  detail: z.string(),
  href: z.string().optional(),
});

const UsesLocale = z.object({
  kicker: z.string(),
  title: z.string(),
  intro: z.string(),
  groups: z.array(
    z.object({
      label: z.string(),
      intro: z.string(),
      items: z.array(UsesItem),
    }),
  ),
});

const usesSchema = z.object({
  type: z.literal("uses"),
  en: UsesLocale,
  es: UsesLocale,
});

/**
 * A Wikidata-grounded subject of a project. `wikidata` is a Q-id verified via
 * the `wbgetentities` API (label AND description read before adoption), so a
 * search engine that has never seen the project can still place it in a field
 * it does know. The first topic becomes schema.org `about`, the rest
 * `mentions` — the same split blog posts use.
 */
const ProjectTopic = z.object({
  name: z.string(),
  wikidata: z.string().regex(/^Q\d+$/, "Wikidata Q-id, e.g. Q37227"),
});

/**
 * One open-source project shown on /projects/ and emitted as a JSON-LD node
 * authored by the canonical `#person`. See the header comment in
 * `src/content/profile/projects.yaml` for the editing rules — in particular,
 * `name`/`summary.en` must not contradict what the project's own docs site
 * publishes for the same `#software` @id.
 */
const ProjectEntry = z.object({
  /** GitHub repo name; also derives the `#software` @id. */
  id: z.string(),
  /** Canonical entity name (may differ from the repo name). */
  name: z.string(),
  status: z.enum(["active", "archived"]),
  schemaType: z.enum(["SoftwareApplication", "SoftwareSourceCode"]),
  /** SoftwareApplication only — omitted for SoftwareSourceCode nodes. */
  applicationCategory: z.string().optional(),
  applicationSubCategory: z.string().optional(),
  language: z.string(),
  /** SPDX-style identifier; mapped to a license URL in `@utils/projects`. */
  license: z.string(),
  repo: z.url(),
  /** Documentation entry point (a docs site, or the repo README anchor). */
  docs: z.url(),
  /** Spanish documentation, when the project publishes a translated site. */
  docsEs: z.url().optional(),
  /**
   * Where a public, already-running instance of this software is documented
   * and can be tried (currently the MCP servers on mcp.jmrp.io). It points at
   * that page, NOT at the raw endpoint: the MCP endpoints answer 405 to the
   * `GET` a browser would send, so linking them directly would hand the reader
   * an error page instead of the thing.
   *
   * Rendered as a card link only, never emitted in JSON-LD: the running
   * instance is a different entity from the program, and the site that hosts
   * it already publishes that node and ties it to this project's `#software`
   * @id through `targetProduct`.
   */
  hosted: z.url().optional(),
  /** Spanish page for the hosted instance, when it publishes one. */
  hostedEs: z.url().optional(),
  /**
   * The raw, callable endpoint of the running instance (currently the MCP
   * servers on mcp.jmrp.io). Presence of this field is what marks a project
   * as part of the self-hosted MCP fleet: BaseHead's `owns` and
   * `scripts/ci/build-identity.mjs` derive the `<endpoint>#api` @ids from it,
   * the /homelab/ MCP card lists it, and llms.txt's MCP section iterates it —
   * one YAML edit is all a new server needs. Unlike `hosted`, this URL is for
   * MACHINES (`POST` transport; a browser `GET` answers 405 by design).
   */
  endpoint: z.url().optional(),
  /** Extra canonical URLs for the software entity (registries, PyPI, DOI). */
  sameAs: z.array(z.url()).optional(),
  topics: z.array(ProjectTopic).min(1),
  summary: LocalizedString,
});

const projectsSchema = z.object({
  type: z.literal("projects"),
  projects: z.array(ProjectEntry).min(1),
});

const profile = defineCollection({
  loader: glob({
    pattern: "**/*.yaml",
    base: "./src/content/profile",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.discriminatedUnion("type", [
    aboutSchema,
    usesSchema,
    projectsSchema,
  ]),
});

export const collections = {
  posts,
  site_config,
  cv,
  publications_data,
  tools,
  profile,
};
