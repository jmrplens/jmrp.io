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
      description: z.string().optional(),
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
        .array(z.object({ name: z.string(), wikidata: z.string() }))
        .optional(),
      /**
       * FAQ pairs. Rendered as a visible accessible FAQ section AND emitted as
       * FAQPage JSON-LD — single source of truth. Only add genuine Q&A.
       */
      faq: z
        .array(z.object({ question: z.string(), answer: z.string() }))
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
      twitter_creator: z.string(),
      logo_text: z.string(),
      nav: z.array(z.object({ label: z.string(), href: z.string() })),
      hero: z.object({
        title: z.string(),
        subtitle: z.string(),
        bio: z.array(z.string()),
      }),
      featured_projects: z.array(z.string()).optional(),
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
      scholar_userid: z.string().optional(),
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

/** Schema for a link item within the CV. */
const CVLink = z.object({
  link: z.string(),
  name: z.string().optional(),
  linkname: z.string().optional(),
  download: z.string().optional(),
  ariaLabel: z.string().optional(),
});

/** Schema for a simple key-value or list item in CV sections. */
const CVMapItem = z.object({
  name: z.string(),
  value: z.string().optional(),
  links: z.array(CVLink).optional(),
});

/** Schema for a chronologically listed item (Education, Experience). */
const CVTimelineItem = z.object({
  title: z.string(),
  institution: z.string().optional(),
  department: z.string().optional(),
  location: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  summary: z.string().optional(),
  description: z
    .array(
      z.union([
        z.string(),
        z.object({
          title: z.string(),
          contents: z.array(z.string()),
        }),
      ]),
    )
    .optional(),
  linkitems: z.array(CVLink).optional(),
});

/** Schema for an individual skill or tool. */
const CVSkillItem = z.object({
  name: z.string(),
  icon: z.string().optional(),
  level: z.number().optional(),
  desc: z.string().optional(),
});

/** Schema for a grouped collection of skills. */
const CVSkillGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVSkillItem),
});

/** Schema for a certificate or award. */
const CVCertificateItem = z.object({
  name: z.string(),
  school: z.string().optional(),
  time: z.string().optional(),
  link: z.string().optional(),
  linkname: z.string().optional(),
});

/** Schema for a grouped collection of certificates. */
const CVCertificateGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVCertificateItem),
});

/**
 * Configuration for 'cv' data collection.
 * Defines the complex structure for the multi-section resume.
 */
const cv = defineCollection({
  loader: glob({
    pattern: "**/*.yaml",
    base: "./src/content/cv",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: z.array(
    z.discriminatedUnion("type", [
      z.object({
        title: z.string(),
        type: z.literal("map"),
        contents: z.array(CVMapItem),
      }),
      z.object({
        title: z.string(),
        type: z.literal("time_table"),
        contents: z.array(CVTimelineItem),
      }),
      z.object({
        title: z.string(),
        type: z.literal("list_groups"),
        contents: z.array(CVSkillGroup),
      }),
      z.object({
        title: z.string(),
        type: z.literal("certificate_list"),
        contents: z.array(CVCertificateGroup),
      }),
    ]),
  ),
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
    appComponent: z.string(),
    /** Extra props to pass to the app component, e.g. { showExplanation: true }. */
    appProps: z.record(z.string(), z.any()).optional(),
    publishedDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    /**
     * FAQ pairs for the tool. Rendered as a visible accessible FAQ section AND
     * emitted as FAQPage JSON-LD — single source of truth. Only genuine Q&A.
     */
    faq: z
      .array(z.object({ question: z.string(), answer: z.string() }))
      .optional(),
  }),
});

export const collections = { posts, site_config, cv, publications_data, tools };
