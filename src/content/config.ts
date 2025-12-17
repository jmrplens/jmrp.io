import { defineCollection, z } from 'astro:content';

/**
 * Collection definition for 'posts'.
 * Represents standard blog posts or articles.
 */
const posts = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(), // Post title (required)
        publishedDate: z.coerce.date(), // Publication date
        updatedDate: z.coerce.date().optional(), // Last updated date
        draft: z.boolean().default(false), // Draft status, defaults to false
        description: z.string().optional(), // SEO description
        author: z.string().optional(), // Author name (defaults to site author)
        authorEmail: z.string().email().optional(), // Author email for RSS feed
        coverImage: z.string().optional(), // Cover image URL or path
        tags: z.array(z.string()).optional(), // List of tags/categories
    }),
});

// Export collections variable to register them with Astro
export const collections = { posts };
