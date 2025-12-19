import fs from 'node:fs';
import { glob } from 'glob';
import crypto from 'node:crypto';

const DIST_DIR = 'dist';

async function moveInlineStyles() {
    console.log(`Scanning ${DIST_DIR} for inline styles to extract...`);
    const files = await glob('**/*.html', { cwd: DIST_DIR, absolute: true });

    let totalReplacements = 0;
    let totalFilesModified = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let modified = false;

        const styleToClassMap = new Map();

        // Regex explanation:
        // 1. (<[\w-]+)       : Match tag start (e.g. <div)
        // 2. ((?:\s+[^>]*?)?): Match pre-attributes (optional)
        // 3. \s+style=       : Match style attribute start (must be preceded by space)
        // 4. (["'])          : Match quote (group 3)
        // 5. (.*?)           : Match style content (group 4)
        // 6. \3              : Match closing quote
        // 7. ([^>]*?)(>)     : Match post-attributes and closing bracket (group 5, 6)
        const TAG_REGEX = /(<[\w-]+)([^>]*?)\s+style=(["'])(.*?)\3([^>]*?)(>)/gi;

        content = content.replaceAll(TAG_REGEX, (match, tagStart, preAttrs, quote, styleContent, postAttrs, tagEnd) => {
            // Normalize attributes to strings (undefined guard)
            preAttrs = preAttrs || '';
            postAttrs = postAttrs || '';

            // Generate class name
            if (!styleToClassMap.has(styleContent)) {
                // Short deterministic hash
                const hash = crypto.createHash('shake256', { outputLength: 4 }).update(styleContent).digest('hex');
                styleToClassMap.set(styleContent, `ec-${hash}`);
            }
            const newClassName = styleToClassMap.get(styleContent);

            modified = true;
            totalReplacements++;

            // Helper to check and inject class
            const classAttrRegex = /class=(["'])(.*?)\1/;
            const injectClass = (attrs) => {
                return attrs.replace(classAttrRegex, (m, q, c) => {
                    // Avoid duplicate classes if rerunning
                    if (c.split(/\s+/).includes(newClassName)) return m;
                    return `class=${q}${c} ${newClassName}${q}`;
                });
            };

            // Check if class attribute exists in pre or post attributes
            if (classAttrRegex.test(preAttrs)) {
                preAttrs = injectClass(preAttrs);
                return `${tagStart}${preAttrs}${postAttrs}${tagEnd}`;
            } else if (classAttrRegex.test(postAttrs)) {
                postAttrs = injectClass(postAttrs);
                return `${tagStart}${preAttrs}${postAttrs}${tagEnd}`;
            } else {
                // No existing class attribute, append new one (convention: after preAttrs)
                // Ensure space if preAttrs is not empty/space already (it captures leading space)
                return `${tagStart}${preAttrs} class="${newClassName}"${postAttrs}${tagEnd}`;
            }
        });

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
                content += styleBlock;
            }

            fs.writeFileSync(file, content, 'utf-8');
            totalFilesModified++;
        }
    }

    console.log(`Extraction complete.`);
    console.log(`Modified ${totalFilesModified} files.`);
    console.log(`Replaced ${totalReplacements} inline style attributes.`);
}

await moveInlineStyles();
