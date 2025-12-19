import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { glob } from 'glob';

const DIST_DIR = 'dist';
const HTML_PATTERN = '**/*.html';

/**
 * Calculate the SRI hash for a file content
 * @param {string} content 
 * @returns {string} The integrity string (e.g., "sha384-...")
 */
function calculateSRI(content) {
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    return `sha384-${hash}`;
}

async function main() {
    console.log(`Scanning ${DIST_DIR} for HTML files to add SRI...`);

    const files = await glob(HTML_PATTERN, { cwd: DIST_DIR, absolute: true });

    if (files.length === 0) {
        console.log('No HTML files found.');
        return;
    }

    let modifiedFilesCount = 0;
    let totalTagsUpdated = 0;

    // Cache for file hashes to avoid re-reading/hashing the same asset multiple times
    const hashCache = new Map();

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let modified = false;

        // Process <script src="...">
        // We look for scripts that have a src, don't have integrity yet, and are local (not starting with http/https/double slash)
        // Regex explanation:
        // <script : literal
        // [^>]* : any attributes before src
        // \bsrc=["'] : src attribute start
        // ([^"']+) : capture the src path
        // ["'] : src attribute end
        // [^>]* : any attributes after src
        // > : closing tag
        // We need to be careful with regex replacement to allow inserting the integrity attribute.

        // A better approach for replacement is to use replaceAll with a callback
        // <script ... src="path" ... >
        const scriptRegex = /<script\s+([^>]*\bsrc=["']([^"']+)["'][^>]*)>/gi;
        content = content.replaceAll(scriptRegex, (match, attrs, src) => {
            if (attrs.includes('integrity=')) return match; // Already has integrity
            if (src.startsWith('http') || src.startsWith('//')) return match; // External

            try {
                // Resolve file path. src is usually like "/_astro/file.hash.js" or "./file.js"
                // We need to map this to the filesystem path in dist/

                let filePath;
                if (src.startsWith('/')) {
                    filePath = path.join(DIST_DIR, src);
                } else {
                    // Relative path, resolve relative to the HTML file
                    const htmlDir = path.dirname(file);
                    // This is tricky if we don't know the exact base, but assuming flat structure or standard relative handling
                    // For now, let's assume standard root-relative assets as Astro usually generates
                    // If it's pure relative, we need to path.join(htmlDir, src) but we are running from project root
                    filePath = path.join(path.dirname(file), src);
                }

                // Quick fix: If path tries to go outside DIST_DIR or is not found, skip
                // Actually, let's just try to read it.
                // But wait, Astro usually produces root-relative links e.g. /script.js
                // So path.join(DIST_DIR, src) is usually correct for src starting with /
                if (!src.startsWith('/')) {
                    // Handle relative paths? Astro usually uses root relative /...
                    // Let's defer relative path handling unless we verify it's needed.
                    // For now, only process root-relative paths for safety and simplicity as per standard Astro output.
                    return match;
                }

                // Remove query strings if any
                const cleanFilePath = filePath.split('?')[0];

                if (!fs.existsSync(cleanFilePath)) {
                    // console.warn(`Asset not found: ${cleanFilePath}`);
                    return match;
                }

                let hash;
                if (hashCache.has(cleanFilePath)) {
                    hash = hashCache.get(cleanFilePath);
                } else {
                    const fileContent = fs.readFileSync(cleanFilePath);
                    hash = calculateSRI(fileContent);
                    hashCache.set(cleanFilePath, hash);
                }

                totalTagsUpdated++;
                modified = true;
                return `<script ${attrs} integrity="${hash}" crossorigin="anonymous">`;

            } catch (err) {
                console.warn(`Error processing script ${src}:`, err.message);
                return match;
            }
        });

        // Process <link rel="stylesheet" href="...">
        const styleRegex = /<link\s+([^>]*\bhref=["']([^"']+)["'][^>]*)>/gi;
        content = content.replaceAll(styleRegex, (match, attrs, href) => {
            // Check if it is a stylesheet
            if (!attrs.includes('rel="stylesheet"') && !attrs.includes("rel='stylesheet'")) return match;
            if (attrs.includes('integrity=')) return match;
            if (href.startsWith('http') || href.startsWith('//')) return match;

            try {
                if (!href.startsWith('/')) return match; // Skip relative for now

                const filePath = path.join(DIST_DIR, href);
                const cleanFilePath = filePath.split('?')[0];

                if (!fs.existsSync(cleanFilePath)) {
                    return match;
                }

                let hash;
                if (hashCache.has(cleanFilePath)) {
                    hash = hashCache.get(cleanFilePath);
                } else {
                    const fileContent = fs.readFileSync(cleanFilePath);
                    hash = calculateSRI(fileContent);
                    hashCache.set(cleanFilePath, hash);
                }

                totalTagsUpdated++;
                modified = true;
                return `<link ${attrs} integrity="${hash}" crossorigin="anonymous">`;

            } catch (err) {
                console.warn(`Error processing style ${href}:`, err.message);
                return match;
            }
        });

        if (modified) {
            fs.writeFileSync(file, content, 'utf-8');
            modifiedFilesCount++;
        }
    }

    console.log(`\nSRI Injection complete.`);
    console.log(`Modified ${modifiedFilesCount} files.`);
    console.log(`Updated ${totalTagsUpdated} tags with integrity attributes.`);
}

await main();
