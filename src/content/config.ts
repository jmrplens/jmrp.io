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
      twitter_creator: z.string(),
      logo_text: z.string(),
      nav: z.array(z.object({ label: z.string(), href: z.string() })),
      hero: z.object({
        title: z.string(),
        subtitle: z.string(),
        bio: z.array(z.string()),
      }),
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
        custom_social: z.array(z.any()).optional(),
      })
      .catchall(z.any()),
  ]),
});

const cv = defineCollection({
  type: "data",
  schema: z.array(
    z.object({
      title: z.string(),
      type: z.enum(["map", "time_table", "list_groups", "certificate_list"]),
      contents: z.any(), // Keeping flexible for now
    }),
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
