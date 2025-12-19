import fs from 'fs';
import { glob } from 'glob';
import crypto from 'crypto';

const DIST_DIR = 'dist';
// Target inline styles that start with a CSS variable (e.g. --0 or --callout)
const TARGET_STYLE_REGEX = /style=["'](--[^"']+)["']/g;

async function moveInlineStyles() {
    console.log(`Scanning ${DIST_DIR} for inline styles to extract...`);
    const files = await glob('**/*.html', { cwd: DIST_DIR, absolute: true });

    let totalReplacements = 0;
    let totalFilesModified = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let modified = false;

        // Map to store style definition -> class name for this file
        // We scope this per file, but could be global. Per file is safer for now to avoid massive shared sheets if not needed.
        // Actually, since we are injecting into head, per-file is required unless we generate a shared CSS file.
        // Let's go with per-file <style> injection as it's simpler and standard for this kind of "critical CSS" fix.
        const styleToClassMap = new Map();
        let classCounter = 0;

        // 1. Find all matching styles and generate classes
        content = content.replace(TARGET_STYLE_REGEX, (match, styleContent) => {
            if (!styleToClassMap.has(styleContent)) {
                // Generate a short, deterministic class name based on content hash to ensure consistent builds
                const hash = crypto.createHash('shake256', { outputLength: 4 }).update(styleContent).digest('hex');
                const className = `ec-${hash}`;
                styleToClassMap.set(styleContent, className);
            }

            modified = true;
            totalReplacements++;
            return `class="${styleToClassMap.get(styleContent)}"`;
        });

        // 2. Inject <style> block if replacements were made
        if (modified) {
            let cssRules = '';
            for (const [styleDef, className] of styleToClassMap.entries()) {
                cssRules += `.${className}{${styleDef}}`;
            }

            // The nonce placeholder is exactly "NGINX_CSP_NONCE" based on user's setup
            const styleBlock = `<style nonce="NGINX_CSP_NONCE">${cssRules}</style>`;

            // Insert before </head>
            if (content.includes('</head>')) {
                content = content.replace('</head>', `${styleBlock}</head>`);
            } else {
                // Fallback (unlikely for valid HTML)
                content += styleBlock;
            }

            fs.writeFileSync(file, content, 'utf-8');
            totalFilesModified++;
            // console.log(`Modified ${file}`);
        }
    }

    console.log(`Extraction complete.`);
    console.log(`Modified ${totalFilesModified} files.`);
    console.log(`Replaced ${totalReplacements} inline style attributes.`);
}

moveInlineStyles();
