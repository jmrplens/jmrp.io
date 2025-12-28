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

const site_config = defineCollection({
  type: "data",
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

// CV Schema Definitions
const CVLink = z.object({
  link: z.string(),
  name: z.string().optional(),
  linkname: z.string().optional(),
  download: z.string().optional(),
  ariaLabel: z.string().optional(),
});

const CVMapItem = z.object({
  name: z.string(),
  value: z.string().optional(),
  links: z.array(CVLink).optional(),
});

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

const CVSkillItem = z.object({
  name: z.string(),
  icon: z.string().optional(),
  level: z.number().optional(),
  desc: z.string().optional(),
});

const CVSkillGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVSkillItem),
});

const CVCertificateItem = z.object({
  name: z.string(),
  school: z.string(),
  time: z.string(),
  link: z.string(),
  linkname: z.string(),
});

const CVCertificateGroup = z.object({
  category: z.string(),
  icon: z.string().optional(),
  items: z.array(CVCertificateItem),
});

const cv = defineCollection({
  type: "data",
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

const publications_data = defineCollection({
  type: "data",
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

// Export collections variable to register them with Astro
export const collections = { posts, site_config, cv, publications_data };
