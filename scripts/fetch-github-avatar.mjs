import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const USERNAME = "jmrplens";
const OUTPUT_DIR = "src/assets";
const OUTPUT_FILE = "github-avatar.png";
const API_URL = `https://api.github.com/users/${USERNAME}`;

console.log(`Fetching GitHub profile for ${USERNAME}...`);

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Get Profile Data to find Avatar URL
try {
  const profile = await fetchJson(API_URL);
  if (!profile.avatar_url) {
    throw new Error("No avatar_url found in profile response.");
  }

  console.log(`Found avatar URL: ${profile.avatar_url}`);

  // 2. Download Image
  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  await downloadFile(profile.avatar_url, outputPath);

  console.log(`Avatar saved to ${outputPath}`);
} catch (error) {
  console.error("Error downloading avatar:", error.message);
  process.exit(1);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Node.js/Build-Script",
      },
    };

    https
      .get(url, options, (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(`API Request failed with status code ${res.statusCode}`),
          );
          return;
        }

        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const options = {
      headers: {
        "User-Agent": "Node.js/Build-Script",
      },
    };

    https
      .get(url, options, (res) => {
        if (res.statusCode !== 200) {
          reject(
            new Error(
              `Image Request failed with status code ${res.statusCode}`,
            ),
          );
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {}); // Delete failed file
        reject(err);
      });
  });
}
