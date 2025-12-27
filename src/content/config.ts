import { defineCollection, z } from "astro:content";

/**
 * Collection definition for 'posts'.
 * Represents standard blog posts or articles.
 */
const posts = defineCollection({
  type: "content",
  schema: ({ image }) =>
    z.object({
      title: z.string(), // Post title (required)
      publishedDate: z.coerce.date(), // Publication date
      updatedDate: z.coerce.date().optional(), // Last updated date
      draft: z.boolean().default(false), // Draft status, defaults to false
      description: z.string().optional(), // SEO description
      author: z.string().optional(), // Author name (defaults to site author)
      authorEmail: z.string().email().optional(), // Author email for RSS feed
      coverImage: image().optional(), // Cover image URL or path
      tags: z.array(z.string()).optional(), // List of tags/categories
    }),
});

/**
 * Global site configuration.
 */
const site = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    url: z.string().url(),
    keywords: z.string(),
    fediverse_creator: z.string().optional(),
    locale: z.string(),
    type: z.string(),
    theme_color: z.string(),
    twitter_creator: z.string().optional(),
    logo_text: z.string(),
    nav: z.array(
      z.object({
        label: z.string(),
        href: z.string(),
      }),
    ),
    hero: z.object({
      title: z.string(),
      subtitle: z.string(),
      bio: z.array(z.string()),
    }),
  }),
});

/**
 * Social media links and usernames.
 */
const socials = defineCollection({
  type: "data",
  schema: z.object({
    github_username: z.string().optional(),
    linkedin_username: z.string().optional(),
    mastodon_username: z.string().optional(),
    scholar_userid: z.string().optional(),
    matrix_id: z.string().optional(),
    work_url: z.string().url().optional(),
    custom_social: z
      .array(
        z.object({
          icon: z.string().optional(),
          icon_name: z.string().optional(),
          icon_light: z.string().optional(),
          icon_dark: z.string().optional(),
          title: z.string(),
          url: z.string().url(),
        }),
      )
      .optional(),
  }),
});

/**
 * Curriculum Vitae data schemas.
 */
const CVMapContent = z.object({
  name: z.string(),
  value: z.string().optional(),
  links: z
    .array(
      z.object({
        link: z.string(),
        name: z.string(),
        download: z.string().optional(),
      }),
    )
    .optional(),
});

const CVTimelineContent = z.object({
  title: z.string(),
  institution: z.string().optional(),
  department: z.string().optional(),
  year: z.coerce.string(),
  location: z.string().optional(),
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
  linkitems: z
    .array(
      z.object({
        link: z.string(),
        linkname: z.string(),
        ariaLabel: z.string().optional(),
      }),
    )
    .optional(),
});

const CVListGroupContent = z.object({
  category: z.string(),
  icon: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      icon: z.string().optional(),
      level: z.number().optional(),
      desc: z.string().optional(),
    }),
  ),
});

const CVCertificateContent = z.object({
  category: z.string(),
  icon: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      school: z.string(),
      time: z.string(),
      link: z.string(),
      linkname: z.string(),
    }),
  ),
});

const cv = defineCollection({
  type: "data",
  schema: z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("map"),
        title: z.string(),
        contents: z.array(CVMapContent),
      }),
      z.object({
        type: z.literal("time_table"),
        title: z.string(),
        contents: z.array(CVTimelineContent),
      }),
      z.object({
        type: z.literal("list_groups"),
        title: z.string(),
        contents: z.array(CVListGroupContent),
      }),
      z.object({
        type: z.literal("certificate_list"),
        title: z.string(),
        contents: z.array(CVCertificateContent),
      }),
    ]),
  ),
});

/**
 * Publications data (co-authors).
 */
const publications = defineCollection({
  type: "data",
  schema: z.record(
    z.array(
      z.object({
        firstname: z.array(z.string()),
        url: z.string().url(),
      }),
    ),
  ),
});

/**
 * Self-hosted services data.
 */
const services = defineCollection({
  type: "data",
  schema: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      icon: z.string(),
      description: z.string(),
      link: z.string().url(),
      linkText: z.string(),
      extraInfo: z.string().optional(),
      statsType: z.enum([
        "mastodon",
        "matrix",
        "meshmonitor-lf",
        "meshmonitor-mf",
        "meshtastic-combined",
      ]),
    }),
  ),
});

// Export collections variable to register them with Astro
export const collections = { posts, site, socials, cv, publications, services };
