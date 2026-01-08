/**
 * GitHub Avatar Fetcher
 *
 * This script automatically downloads the GitHub profile picture for the project owner.
 * It's used during the build process to ensure the site has the latest profile image
 * without needing to manually upload it to the repository.
 *
 * Features:
 * - Fetches profile data from GitHub API.
 * - Downloads and saves the image to src/assets/github-avatar.png.
 * - Implements a fallback to 'mehome.jpg' if the download fails or the API is unreachable.
 * - Prevents build failure if an existing avatar is already present.
 */

import fs from "node:fs";
import path from "node:path";

const USERNAME = "jmrplens";
const OUTPUT_DIR = "src/assets";
const OUTPUT_FILE = "github-avatar.png";
const API_URL = `https://api.github.com/users/${USERNAME}`;

console.log(`Fetching GitHub profile for ${USERNAME}...`);

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
const fallbackPath = path.join(OUTPUT_DIR, "mehome.jpg");

try {
  // 1. Get Profile Data to find Avatar URL
  const profile = await fetch(API_URL, {
    headers: { "User-Agent": "Node.js/Build-Script" },
  }).then((res) => {
    if (!res.ok) {
      throw new Error(`API Request failed with status code ${res.status}`);
    }
    return res.json();
  });

  if (!profile.avatar_url) {
    throw new Error("No avatar_url found in profile response.");
  }

  console.log(`Found avatar URL: ${profile.avatar_url}`);

  // 2. Download Image
  const imageRes = await fetch(profile.avatar_url, {
    headers: { "User-Agent": "Node.js/Build-Script" },
  });

  if (!imageRes.ok) {
    throw new Error(`Image Request failed with status code ${imageRes.status}`);
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  try {
    fs.writeFileSync(outputPath, buffer);
  } catch (writeError) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    throw writeError;
  }

  console.log(`Avatar saved to ${outputPath}`);
} catch (error) {
  console.warn(
    `Warning: Could not download GitHub avatar (${error.message}). Using fallback.`,
  );

  // If the file doesn't exist, use fallbackPath as fallback
  if (fs.existsSync(outputPath)) {
    console.log("Using existing github-avatar.png from previous build.");
  } else if (fs.existsSync(fallbackPath)) {
    console.log(`Copying ${fallbackPath} to ${outputPath} as fallback...`);
    fs.copyFileSync(fallbackPath, outputPath);
  } else {
    console.error(
      "Critical Error: Neither GitHub avatar nor fallback image found!",
    );
    process.exit(1);
  }
}
