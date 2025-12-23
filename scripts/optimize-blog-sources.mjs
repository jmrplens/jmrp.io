import sharp from "sharp";
import fs from "fs";
import path from "path";

const dir = "src/assets/images/blog";
const files = ["csp-shield.png", "mtls-auth.png", "virtual-files.png"];

async function optimize() {
  for (const file of files) {
    const inputPath = path.join(dir, file);
    const outputPath = path.join(dir, file.replace(".png", ".webp"));

    console.log(`Optimizing ${inputPath} -> ${outputPath}`);

    await sharp(inputPath)
      .resize(1200) // Standard width
      .webp({ quality: 80 })
      .toFile(outputPath);

    // Remove original PNG to save space and prevent emission
    fs.unlinkSync(inputPath);
  }
}

optimize().catch(console.error);
