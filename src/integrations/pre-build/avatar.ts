import fs from "node:fs";
import path from "node:path";

const USERNAME = "jmrplens";
const OUTPUT_DIR = "src/assets";
const OUTPUT_FILE = "github-avatar.png";
const API_URL = `https://api.github.com/users/${USERNAME}`;

/**
 * Fetches and saves the project owner's GitHub avatar.
 * Implements fallbacks to existing or local images if network fails.
 */
export async function setupGithubAvatar() {
  console.log(`[PreBuild] Fetching GitHub profile for ${USERNAME}...`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  const fallbackPath = path.join(OUTPUT_DIR, "mehome.jpg");

  try {
    // 1. Get Profile Data
    const profile = await fetch(API_URL, {
      headers: { "User-Agent": "Astro-PreBuild-Integration" },
      signal: AbortSignal.timeout(10000),
    }).then((res) => {
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    });

    if (!profile.avatar_url) throw new Error("No avatar_url found.");

    // 2. Download Image
    const imageRes = await fetch(profile.avatar_url, {
      headers: { "User-Agent": "Astro-PreBuild-Integration" },
      signal: AbortSignal.timeout(15000),
    });

    if (!imageRes.ok) throw new Error(`Image error: ${imageRes.status}`);

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    try {
      fs.writeFileSync(outputPath, buffer);
      console.log(`  ✓ Avatar saved to ${outputPath}`);
    } catch (writeError) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw writeError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `  ⚠ Could not download GitHub avatar (${message}). Using fallback.`,
    );

    if (fs.existsSync(outputPath)) {
      console.log("  ✓ Using existing github-avatar.png.");
    } else if (fs.existsSync(fallbackPath)) {
      fs.copyFileSync(fallbackPath, outputPath);
      console.log("  ✓ Copied local fallback image.");
    } else {
      throw new Error("Critical: No GitHub avatar or fallback image found!");
    }
  }
}
