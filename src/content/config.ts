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

export const collections = { news };
