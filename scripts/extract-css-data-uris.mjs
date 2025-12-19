import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import crypto from 'node:crypto';

const DIST_DIR = 'dist';
const ASSETS_DIR = 'assets/extracted';
const TARGET_DIR = path.join(DIST_DIR, ASSETS_DIR);

// Regex to capture url("data:...") or url('data:...') or url(data:...)
// Pattern is bounded by ) which prevents catastrophic backtracking
// NOSONAR: javascript:S5852 - False positive, [^)]* is safe as ) is unambiguous end delimiter
const DATA_URI_REGEX = /url\(\s*(['"]?)data:([^;,]+)(;base64)?\s*,\s*([^)]*)\1\s*\)/gi;

async function extractDataUris() {
    console.log('Starting Data URI extraction...');

    // Ensure target directory exists
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
    }

    // 1. Scan CSS files
    const cssFiles = await glob(`${DIST_DIR}/**/*.css`);
    // 2. Scan HTML files (for inline styles)
    const htmlFiles = await glob(`${DIST_DIR}/**/*.html`);

    const allFiles = [...cssFiles, ...htmlFiles];
    let totalExtracted = 0;

    for (const file of allFiles) {
        let content = fs.readFileSync(file, 'utf-8');
        let modified = false;

        // We need to use a loop with replace or matchAll to handle multiple occurrences
        // Using replace with a callback is safer for string manipulation
        content = content.replaceAll(DATA_URI_REGEX, (fullMatch, quote, mime, encoding, data) => {
            try {
                // Decode data
                let buffer;
                if (encoding === ';base64') {
                    buffer = Buffer.from(data, 'base64');
                } else {
                    // It's likely URI encoded (percent encoding)
                    // Sometimes data in CSS might have escaped characters, standard decodeURIComponent should work
                    // but we might need to handle specific CSS escaping if present.
                    // Usually for SVG in CSS it's just %3C...
                    buffer = Buffer.from(decodeURIComponent(data.trim()));
                }

                // Determine extension
                let ext = 'bin';
                if (mime.includes('svg')) ext = 'svg';
                else if (mime.includes('png')) ext = 'png';
                else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
                else if (mime.includes('gif')) ext = 'gif';
                else if (mime.includes('webp')) ext = 'webp';

                // Generate Hash for filename
                const hash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
                const filename = `${hash}.${ext}`;
                const filePath = path.join(TARGET_DIR, filename);

                // Write file if it doesn't exist (deduplication)
                if (!fs.existsSync(filePath)) {
                    fs.writeFileSync(filePath, buffer);
                    totalExtracted++;
                }

                // Construct new URL
                // We need the path relative to the site root for the CSS/HTML
                const newUrl = `/${ASSETS_DIR}/${filename}`;

                modified = true;
                // Return the new CSS url(...)
                // Maintain the original quote style if present, or use double quotes
                const q = quote || '"';
                return `url(${q}${newUrl}${q})`;

            } catch (err) {
                console.warn(`Failed to process Data URI in ${file}: ${err.message}`);
                return fullMatch; // Do not replace if error
            }
        });

        if (modified) {
            fs.writeFileSync(file, content, 'utf-8');
            console.log(`Updated ${file}`);
        }
    }

    console.log(`Extraction complete. Extracted ${totalExtracted} unique assets.`);
}

await extractDataUris();
