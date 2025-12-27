import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Configuration from environment or defaults
const USERNAME = process.env.GITHUB_USERNAME || "jmrplens";
const OUTPUT_DIR = "src/assets";
const OUTPUT_FILE = "github-avatar.png";
const API_URL = `https://api.github.com/users/${USERNAME}`;

console.log(`[prebuild] Fetching GitHub profile...`);

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
const fallbackPath = path.join(OUTPUT_DIR, "mehome.jpg");

try {
  const response = await fetch(API_URL, {
    headers: { "User-Agent": "Node.js/Build-Script" },
  });

  if (!response.ok) {
    throw new Error(`API Request failed with status code ${response.status}`);
  }

  const profile = await response.json();
  // Safe to log here as it comes from public API response, not directly from env
  console.log(`[prebuild] Found profile for: ${profile.login}`);

  if (!profile.avatar_url) {
    throw new Error("No avatar_url found in profile response.");
  }

  // Download Image using Stream Pipeline
  const imgResponse = await fetch(profile.avatar_url);
  if (!imgResponse.ok) {
    throw new Error(
      `Image Request failed with status code ${imgResponse.status}`,
    );
  }

  await pipeline(imgResponse.body, fs.createWriteStream(outputPath));
  console.log(`[prebuild] Avatar saved successfully.`);
} catch (error) {
  console.warn(
    `[prebuild] Warning: Could not download GitHub avatar: ${error.message}.`,
  );

  if (!fs.existsSync(outputPath)) {
    if (fs.existsSync(fallbackPath)) {
      console.log(`[prebuild] Using ${fallbackPath} as fallback...`);
      fs.copyFileSync(fallbackPath, outputPath);
    } else {
      console.error("[prebuild] Critical Error: No fallback image found!");
      process.exit(1);
    }
  }
}
