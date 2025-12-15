import { defineCollection, z } from 'astro:content';

const news = defineCollection({
    type: 'content',
    schema: z.object({
        date: z.coerce.date(),
        title: z.string().optional(),
        inline: z.boolean().optional(),
        related_posts: z.boolean().optional(),
    }),
});


const posts = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        publishedDate: z.coerce.date(),
        draft: z.boolean().default(false),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
    }),
});

export const collections = { news, posts };
