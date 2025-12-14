import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { exec } from 'child_process';

// Configuration
const DIST_DIR = 'dist';
const HTML_PATTERN = '**/*.html';
const NGINX_CONF = '/etc/nginx/snippets/security_headers.conf';

async function generateHashes() {
    console.log(`Scanning ${DIST_DIR} for HTML files...`);

    try {
        const files = await glob(HTML_PATTERN, { cwd: DIST_DIR, absolute: true });

        if (files.length === 0) {
            console.log('No HTML files found.');
            return;
        }

        const hashes = new Set();

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');

            // Regex to find content inside <style> tags
            const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            let match;

            while ((match = styleRegex.exec(content)) !== null) {
                const styleContent = match[1];
                if (styleContent) {
                    const hash = crypto.createHash('sha256').update(styleContent).digest('base64');
                    hashes.add(`'sha256-${hash}'`);
                }
            }
        }

        if (hashes.size > 0) {
            console.log('\nGenerated CSP Hashes for style-src:');
            const hashString = Array.from(hashes).join(' ');
            console.log(hashString);

            // Optional: Write to a file for easy reading by other scripts/tools
            fs.writeFileSync('csp-hashes.txt', hashString);
            console.log('\nHashes saved to csp-hashes.txt');

            // Update Nginx Config
            if (fs.existsSync(NGINX_CONF)) {
                console.log(`\nUpdating ${NGINX_CONF}...`);
                let nginxConfig = fs.readFileSync(NGINX_CONF, 'utf-8');

                // Regex to replace existing style-src hashes or 'self' usage.
                // It looks for "style-src 'self'" and captures until the next semicolon.
                const styleSrcRegex = /style-src 'self'[^;]*;/g;
                const newStyleSrc = `style-src 'self' ${hashString};`;

                if (styleSrcRegex.test(nginxConfig)) {
                    nginxConfig = nginxConfig.replace(styleSrcRegex, newStyleSrc);
                    fs.writeFileSync(NGINX_CONF, nginxConfig);
                    console.log('Nginx configuration updated.');

                    // Reload Nginx
                    exec('systemctl reload nginx', (error, stdout, stderr) => {
                        if (error) {
                            console.error(`Error reloading Nginx: ${error.message}`);
                            process.exit(1);
                        }
                        if (stderr) {
                            console.error(`Nginx reload stderr: ${stderr}`);
                        }
                        console.log('Nginx reloaded successfully.');
                    });
                } else {
                    console.warn('Could not find style-src directive in Nginx config to update.');
                }
            } else {
                console.warn(`Nginx config not found at ${NGINX_CONF}`);
            }

        } else {
            console.log('No inline styles found.');
        }

    } catch (err) {
        console.error('Error generating hashes:', err);
        process.exit(1);
    }
}

generateHashes();
