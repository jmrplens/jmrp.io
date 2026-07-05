import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const DIST_DIR = process.env.DIST_DIR ?? "./dist";

/**
 * Recursively walks a directory, invoking `callback` for every file found.
 * @param {string} dir - Directory to walk.
 * @param {(filePath: string) => void} callback - Called with each file path.
 * @returns {void}
 */
function walk(dir, callback) {
  readdirSync(dir).forEach((f) => {
    const dirPath = join(dir, f);
    const isDirectory = statSync(dirPath).isDirectory();
    if (isDirectory) {
      walk(dirPath, callback);
    } else {
      callback(join(dir, f));
    }
  });
}

console.log(`Analyzing icons in '${DIST_DIR}'...`);

let totalMissingCss = 0;

walk(DIST_DIR, (filePath) => {
  if (extname(filePath) !== ".html") return;

  const html = readFileSync(filePath, "utf8");
  // Find all icon classes like i-collection:icon
  const iconClasses = [
    ...html.matchAll(
      /\bclass=['"][^'"]*?\bi-([a-z0-9-]+):([a-z0-9-]+)\b[^'"]*?['"]/gi,
    ),
  ].map((m) => `i-${m[1].toLowerCase()}:${m[2].toLowerCase()}`);

  if (iconClasses.length === 0) return;

  const uniqueIcons = [...new Set(iconClasses)];
  const missingCss = [];

  uniqueIcons.forEach((icon) => {
    // Escape special characters for CSS regex (.i-mdi\:school)
    const escapedIcon = icon.replace(":", String.raw`\\:`);
    const cssRegex = new RegExp(String.raw`\.${escapedIcon}\s*\{`, "i");

    if (!cssRegex.test(html)) {
      // If not inline, search in referenced CSS files
      const cssFiles = [...html.matchAll(/href=['"]([^'"]+?\.css)['"]/g)].map(
        (m) => m[1],
      );
      let foundInExternal = false;
      for (const cssPath of cssFiles) {
        try {
          const fullCssPath = join(
            DIST_DIR,
            cssPath.startsWith("/") ? cssPath : join(filePath, "..", cssPath),
          );
          const cssContent = readFileSync(fullCssPath, "utf8");
          if (cssRegex.test(cssContent)) {
            foundInExternal = true;
            break;
          }
        } catch {
          /* ignore missing files */
        }
      }
      if (!foundInExternal) missingCss.push(icon);
    }
  });

  if (missingCss.length > 0) {
    totalMissingCss += missingCss.length;
    console.log(`\nPage: ${filePath}`);
    console.log(
      `  Found ${uniqueIcons.length} icons, but ${missingCss.length} lack CSS rules:`,
    );
    missingCss.forEach((icon) => console.log(`    - ${icon}`));
  }
});

if (totalMissingCss > 0) {
  console.log(
    `\n❌ Found ${totalMissingCss} icon(s) without CSS rules across the build.`,
  );
  process.exitCode = 1;
} else {
  console.log("\n✨ All icons have matching CSS rules.");
}
