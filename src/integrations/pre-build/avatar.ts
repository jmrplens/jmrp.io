import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

const USERNAME = "jmrplens";
const OUTPUT_DIR = "src/assets";
const OUTPUT_FILE = "github-avatar.png";
const API_URL = `https://api.github.com/users/${USERNAME}`;

/** Path to the GitHub avatar file relative to project root */
export const GITHUB_AVATAR_PATH = `${OUTPUT_DIR}/${OUTPUT_FILE}`;

/** Represents the JSON response from the GitHub user profile API. */
interface GitHubProfileResponse {
  avatar_url: string;
}

/** Maximum allowed avatar file size in bytes (5 MB) */
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

/**
 * Fetches and saves the project owner's GitHub avatar.
 * Implements fallbacks to existing or local images if network fails.
 *
 * @param {AstroIntegrationLogger} logger - The Astro logger instance.
 */
export async function setupGithubAvatar(logger: AstroIntegrationLogger) {
  logger.info(`Fetching GitHub profile for ${USERNAME}...`);

  const outputDirAbs = path.resolve(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(outputDirAbs)) {
    fs.mkdirSync(outputDirAbs, { recursive: true });
  }

  const outputPath = path.join(outputDirAbs, OUTPUT_FILE);
  const fallbackPath = path.join(outputDirAbs, "mehome.jpg");

  try {
    const buffer = await fetchGitHubAvatarBuffer();
    const tmpPath = `${outputPath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    // Remove existing file before rename (Windows compatibility)
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath);
    }
    fs.renameSync(tmpPath, outputPath);
    logger.info(`  ✓ Avatar saved to ${outputPath}`);
  } catch (error) {
    // Clean up temp file if it exists
    const tmpPath = `${outputPath}.tmp`;
    if (fs.existsSync(tmpPath)) {
      try {
        fs.rmSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
    handleAvatarError(error, outputPath, fallbackPath, logger);
  }
}

/**
 * Downloads the GitHub avatar and returns it as a Buffer.
 *
 * @returns {Promise<Buffer>} The image data.
 */
async function fetchGitHubAvatarBuffer(): Promise<Buffer> {
  // 1. Get Profile Data
  const profile = (await fetch(API_URL, {
    headers: { "User-Agent": "Astro-PreBuild-Integration" },
    signal: AbortSignal.timeout(10_000),
  }).then((res) => {
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  })) as GitHubProfileResponse;

  if (!profile.avatar_url) throw new Error("No avatar_url found.");

  // Runtime validation: verify avatar_url is a non-empty string
  if (typeof profile.avatar_url !== "string" || !profile.avatar_url.trim()) {
    throw new Error(
      `Invalid avatar_url type or value: ${JSON.stringify(profile.avatar_url)}`,
    );
  }

  // Security: Validate the avatar URL points to a trusted domain
  const parsedUrl = new URL(profile.avatar_url);
  if (!parsedUrl.hostname.endsWith(".githubusercontent.com")) {
    throw new Error(`Untrusted avatar domain: ${parsedUrl.hostname}`);
  }

  // 2. Download Image
  const imageRes = await fetch(profile.avatar_url, {
    headers: { "User-Agent": "Astro-PreBuild-Integration" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!imageRes.ok) throw new Error(`Image error: ${imageRes.status}`);

  // Security: Verify Content-Type is actually an image
  const contentType = imageRes.headers.get("content-type");
  if (!contentType?.startsWith("image/")) {
    throw new Error(`Invalid content-type: ${contentType}`);
  }

  // Security: Stream the response to enforce size limit during download
  // This prevents DoS from large responses without content-length header
  const contentLength = imageRes.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_AVATAR_SIZE) {
    throw new Error(`Image is too large: ${contentLength} bytes`);
  }

  const chunks: Uint8Array[] = [];
  let receivedLength = 0;

  if (!imageRes.body) {
    throw new Error("Response body is null");
  }
  const reader = imageRes.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Guard against undefined value
    if (!value) continue;

    receivedLength += value.length;
    if (receivedLength > MAX_AVATAR_SIZE) {
      await reader.cancel();
      throw new Error("Downloaded image data exceeds maximum size limit.");
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);

  return buffer;
}

/**
 * Handles errors during avatar fetching by applying fallbacks.
 *
 * @param error - The caught error.
 * @param outputPath - Path to save the final image.
 * @param fallbackPath - Path to the local fallback image.
 * @param logger - The Astro logger instance.
 */
function handleAvatarError(
  error: unknown,
  outputPath: string,
  fallbackPath: string,
  logger: AstroIntegrationLogger,
) {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error);
  logger.warn(`Could not download GitHub avatar (${message}). Using fallback.`);

  // Clean up partial write if any (unlikely with sync write but good practice)
  if (
    fs.existsSync(outputPath) &&
    fs.statSync(outputPath).size === 0 // Check if empty/corrupted
  ) {
    try {
      fs.rmSync(outputPath);
    } catch {
      // Ignore
    }
  }

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    logger.info("Using existing github-avatar.png.");
  } else if (fs.existsSync(fallbackPath)) {
    try {
      fs.copyFileSync(fallbackPath, outputPath);
      logger.info("✓ Copied local fallback image.");
    } catch (copyError) {
      throw new Error(
        `Failed to copy fallback: ${copyError instanceof Error ? copyError.message : String(copyError)}`,
      );
    }
  } else {
    throw new Error("Critical: No GitHub avatar or fallback image found!");
  }
}
