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

        const styleHashes = new Set();
        const scriptHashes = new Set();
        const imageDomains = new Set();

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');

            // 1. Find content inside <style> tags
            const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
            let match;
            while ((match = styleTagRegex.exec(content)) !== null) {
                if (match[1]) {
                    const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
                    styleHashes.add(`'sha256-${hash}'`);
                }
            }

            // 2. Find inline style attributes (style="...")
            const styleAttrRegex = /\sstyle="([^"]*)"/g;
            while ((match = styleAttrRegex.exec(content)) !== null) {
                if (match[1]) {
                    const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
                    styleHashes.add(`'sha256-${hash}'`);
                }
            }

            // 3. Find inline scripts (<script>...</script>)
            // key: exclude <script src="..."> tags which don't have inline content usually, 
            // but regex will capture content if it exists.
            const scriptTagRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
            while ((match = scriptTagRegex.exec(content)) !== null) {
                if (match[1]) {
                    const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
                    scriptHashes.add(`'sha256-${hash}'`);
                }
            }

            // 4. Find external images (<img src="...">)
            const imgTagRegex = /<img[^>]+src="([^"]+)"/gi;
            while ((match = imgTagRegex.exec(content)) !== null) {
                const src = match[1];
                if (src.startsWith('http')) {
                    try {
                        const url = new URL(src);
                        imageDomains.add(url.hostname);
                    } catch (e) {
                        // ignore invalid urls
                    }
                }
            }
        }


        // Manual domains for images (e.g. redirects like gstatic)
        const MANUAL_IMG_DOMAINS = [
            '*.gstatic.com',
            'avatars.githubusercontent.com'
        ];

        MANUAL_IMG_DOMAINS.forEach(domain => imageDomains.add(domain));

        // Manual domains for images (e.g. redirects like gstatic)
        const MANUAL_IMG_DOMAINS = [
            '*.gstatic.com',
            'avatars.githubusercontent.com'
        ];



        console.log(`\nFound ${styleHashes.size} unique style hashes.`);
        console.log(`Found ${scriptHashes.size} unique script hashes.`);
        console.log(`Found ${imageDomains.size} unique image domains.`);

        if (styleHashes.size > 0 || scriptHashes.size > 0 || imageDomains.size > 0) {
            const styleHashString = Array.from(styleHashes).join(' ');
            const scriptHashString = Array.from(scriptHashes).join(' ');

            // Generate img-src domains
            const imgDomainString = Array.from(imageDomains).map(d => `https://${d}`).join(' ');
            const imgSrcValue = `img-src 'self' data: ${imgDomainString};`; // Removed generic https:


            // Console output
            console.log('\nStyle Hashes: ' + styleHashString);
            console.log('Script Hashes: ' + scriptHashString);
            console.log('Image Domains: ' + imgDomainString);

            // Update Nginx Config
            if (fs.existsSync(NGINX_CONF)) {
                console.log(`\nUpdating ${NGINX_CONF}...`);
                let nginxConfig = fs.readFileSync(NGINX_CONF, 'utf-8');

                // Update style-src
                // Regex: style-src 'self' ... ;
                const styleSrcRegex = /style-src 'self'[^;]*;/g;
                const newStyleSrc = `style-src 'self' 'unsafe-hashes' ${styleHashString};`;

                if (styleSrcRegex.test(nginxConfig)) {
                    nginxConfig = nginxConfig.replace(styleSrcRegex, newStyleSrc);
                } else {
                    console.warn('Warning: Could not find style-src directive');
                }

                // Update script-src
                const scriptSrcRegex = /script-src 'self'[^;]*;/g;
                const staticScriptParts = "'self' 'nonce-$cspNonce' https://static.cloudflareinsights.com https://cloudflareinsights.com";
                const newScriptSrc = `script-src ${staticScriptParts} ${scriptHashString};`;
                if (scriptSrcRegex.test(nginxConfig)) {
                    nginxConfig = nginxConfig.replace(scriptSrcRegex, newScriptSrc);
                } else {
                    console.warn('Warning: Could not find script-src directive');
                }

                // Update img-src
                const imgSrcRegex = /img-src 'self'[^;]*;/g;
                if (imgSrcRegex.test(nginxConfig)) {
                    nginxConfig = nginxConfig.replace(imgSrcRegex, imgSrcValue);
                } else {
                    console.warn('Warning: Could not find img-src directive');
                }

                fs.writeFileSync(NGINX_CONF, nginxConfig);
                console.log('Nginx configuration updated.');

                // Reload Nginx
                exec('systemctl reload nginx', (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error reloading Nginx: ${error.message}`);
                        process.exit(1);
                    }
                    console.log('Nginx reloaded successfully.');
                });
            }
        }

    } catch (err) {
        console.error('Error generating hashes:', err);
        process.exit(1);
    }
}

generateHashes();
