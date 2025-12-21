
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { glob } from 'glob';

const DIST_DIR = process.env.DIST_DIR || 'dist';

async function convertIcons() {
    const iconDir = path.join(process.cwd(), DIST_DIR, 'icons');
    const icons = await glob(`${iconDir}/*.png`);

    console.log(`Found ${icons.length} PNG icons to convert.`);

    for (const iconPath of icons) {
        const webpPath = iconPath.replace('.png', '.webp');

        console.log(`Converting ${path.basename(iconPath)} to WebP...`);

        await sharp(iconPath)
            .webp({ quality: 80 })
            .toFile(webpPath);

        // Remove the original PNG
        fs.unlinkSync(iconPath);
    }
}

async function updateManifest() {
    const manifestPath = path.join(process.cwd(), DIST_DIR, 'site.webmanifest');

    if (fs.existsSync(manifestPath)) {
        console.log('Updating site.webmanifest...');
        let content = fs.readFileSync(manifestPath, 'utf8');

        // Replace .png with .webp and image/png with image/webp
        content = content.replace(/\.png/g, '.webp');
        content = content.replace(/image\/png/g, 'image/webp');

        fs.writeFileSync(manifestPath, content);
    }
}

async function main() {
    try {
        await convertIcons();
        await updateManifest();
        console.log('Icon conversion complete.');
    } catch (error) {
        console.error('Error converting icons:', error);
        process.exit(1);
    }
}

main();
