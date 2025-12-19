import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');

  // Filter out draft posts in production
  const publishedPosts = posts.filter(post => {
    if (import.meta.env.PROD) {
      return !post.data.draft;
    }
    return true;
  });

  // Sort by publication date (newest first)
  publishedPosts.sort((a, b) => {
    return new Date(b.data.publishedDate).getTime() - new Date(a.data.publishedDate).getTime();
  });

  return rss({
    title: 'José Manuel Requena Plens | Blog',
    description: 'Technical blog on R&D, Embedded Systems, Software Engineering, and Acoustics',
    site: context.site || 'https://jmrp.io',
    items: await Promise.all(publishedPosts.map(async (post) => {
      // Build author string in RFC 822 format: email (Name)
      const authorEmail = post.data.authorEmail || 'mail@jmrp.io';
      const authorName = post.data.author || 'José Manuel Requena Plens';
      const authorString = `${authorEmail} (${authorName})`;

      // Generate full content
      const postBody = post.body || '';
      // Simple cleanup for MDX imports/exports
      const cleanBody = postBody
        .replaceAll(/^import\s+.*;$/gm, '')
        .replaceAll(/^export\s+.*;$/gm, '');

      const html = await marked.parse(cleanBody);
      const sanitizedHtml = sanitizeHtml(html, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'pre', 'code', 'span']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          'img': ['src', 'alt', 'title', 'width', 'height'],
          'a': ['href', 'name', 'target', 'title', 'rel'],
          'code': ['class'],
          'span': ['class', 'style'],
        },
      });

      return {
        title: post.data.title,
        description: post.data.description || '',
        pubDate: new Date(post.data.publishedDate),
        link: `/blog/${post.slug}/`,
        categories: post.data.tags || [],
        author: authorString,
        content: sanitizedHtml,
        // Include cover image if available
        customData: post.data.coverImage
          ? `<enclosure url="${new URL(post.data.coverImage, context.site || 'https://jmrp.io').toString()}" type="image/jpeg" />`
          : '',
      };
    })),
    customData: `<language>en-us</language>
<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
<atom:link href="${new URL('rss.xml', context.site || 'https://jmrp.io').toString()}" rel="self" type="application/rss+xml" />`,
    xmlns: {
      atom: 'http://www.w3.org/2005/Atom',
      content: 'http://purl.org/rss/1.0/modules/content/',
    },
  });
}
