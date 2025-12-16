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
        draft: z.boolean().default(false), // Draft status, defaults to false
        description: z.string().optional(), // SEO description
        tags: z.array(z.string()).optional(), // List of tags/categories
    }),
});

// Export collections variable to register them with Astro
export const collections = { posts };
