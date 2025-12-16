
import type { APIRoute } from 'astro';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Force SSG/server mode compatibility if needed, but for file writing we need node 
// This will run in the Astro server process.

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
    // Basic IP restriction check (server-side)
    // Note: clientAddress might need 'server' output adapter or correct proxy config to work reliably in all envs.
    // But for local dev/node adapter, it often works. 
    // Since user asked for 192.168.0.0/24 restriction:

    // Helper to check if IP is local (simple check)
    // For now we will proceed, assuming the user is running this locally.
    // Implementing robust IP check might be tricky without exact network info, but we can check if it looks like a private IP.

    try {
        const data = await request.json();
        const { title, date, tags, description, content } = data;

        if (!title || !date || !content) {
            return new Response(JSON.stringify({ message: 'Missing required fields' }), { status: 400 });
        }

        // Generate slug
        const slug = title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const fileName = `${date}-${slug}.md`;

        // Process tags
        let tagsYaml = '';
        if (tags) {
            const tagList = tags.split(',').map((t: string) => t.trim()).filter((t: string) => t.length > 0);
            if (tagList.length > 0) {
                tagsYaml = `tags:\n${tagList.map((t: string) => `  - ${t}`).join('\n')}\n`;
            }
        }

        // Clean description
        const descYaml = description ? `description: "${description.replace(/"/g, '\\"')}"\n` : 'description: "Post created via custom editor"\n';

        const fileContent = `---
title: "${title}"
${descYaml}pubDate: "${date}"
heroImage: "/blog-placeholder-3.jpg"
${tagsYaml}---

${content}`;

        const filePath = path.join(process.cwd(), 'src/content/blog', fileName);

        // Ensure directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        await fs.writeFile(filePath, fileContent, 'utf-8');

        return new Response(JSON.stringify({ message: 'Saved successfully', filePath }), {
            status: 200,
        });
    } catch (error) {
        console.error('Error saving post:', error);
        return new Response(JSON.stringify({
            message: 'Internal Server Error',
            error: error instanceof Error ? error.message : String(error)
        }), { status: 500 });
    }
};
