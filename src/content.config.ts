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
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/posts",
    generateId: ({ entry }) => stripExtension(entry),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      publishedDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().default(false),
      description: z.string().optional(),
      author: z.string().optional(),
      authorEmail: z.email().optional(),
      coverImage: image().optional(),
      tags: z.array(z.string()).optional(),
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
  schema: z.union([
    // Site Config
    z.object({
      title: z.string(),
      description: z.string(),
      author: z.string(),
      url: z.string(),
      keywords: z.string(),
      fediverse_creator: z.string(),
      locale: z.string(),
      type: z.string(),
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
    // Socials Config
    z
      .object({
        github_username: z.string().optional(),
        linkedin_username: z.string().optional(),
        mastodon_username: z.string().optional(),
        scholar_userid: z.string().optional(),
        matrix_id: z.string().optional(),
        work_url: z.string().optional(),
        custom_social: z
          .array(
            z.object({
              title: z.string(),
              url: z.string(),
              icon: z.string().optional(),
              icon_name: z.string().optional(),
              icon_light: z.string().optional(),
              icon_dark: z.string().optional(),
            }),
          )
          .optional(),
      })
      .catchall(z.any()),
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
  school: z.string(),
  time: z.string(),
  link: z.string(),
  linkname: z.string(),
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
    z.union([
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
        url: z.string(),
      }),
    ),
  ),
});

export const collections = { posts, site_config, cv, publications_data };
