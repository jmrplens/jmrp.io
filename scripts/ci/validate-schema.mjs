/**
 * Schema.org JSON-LD Validator
 *
 * Extracts and validates structured data (JSON-LD) from all generated HTML pages.
 * It ensures that the project maintains high SEO quality and provides rich
 * results for search engines.
 *
 * Features:
 * - Detects and parses <script type="application/ld+json"> blocks.
 * - Validates essential properties for Person, WebSite, Article, and BreadcrumbList.
 * - Checks for valid ISO dates and absolute URLs.
 * - Generates a detailed console summary and exits with error if issues are found.
 */

import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";
import { glob } from "glob";

const DIST_DIR = path.resolve(process.argv[2] || "dist");

/**
 * Validates that a path is within the DIST_DIR
 */
function isPathSafe(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relative = path.relative(DIST_DIR, resolvedPath);
  return !relative.startsWith("..");
}

/**
 * Extracts JSON-LD scripts from HTML content
 */
function extractJsonLd(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  const jsonLdBlocks = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).text().trim();
    if (!content) return;

    try {
      jsonLdBlocks.push(JSON.parse(content));
    } catch (error) {
      jsonLdBlocks.push({ error: error.message, raw: content });
    }
  });

  return jsonLdBlocks;
}

/**
 * Validates a Person schema
 */
function validatePersonSchema(schema, p, errors, warnings) {
  if (!schema.name) errors.push(`${p}: Missing name`);
  if (schema.url) {
    try {
      new URL(schema.url);
    } catch {
      warnings.push(`${p}: Invalid URL for url: "${schema.url}"`);
    }
  }
}

/**
 * Validates a WebSite schema
 */
function validateWebSiteSchema(schema, p, errors, validateNested) {
  if (!schema.name) errors.push(`${p}: Missing name`);
  if (!schema.url) errors.push(`${p}: Missing url`);
  validateNested("publisher");
}

/**
 * Validates an Article or BlogPosting schema
 */
function validateArticleSchema(schema, p, errors, warnings, validateNested) {
  if (!schema.headline) errors.push(`${p}: Missing headline`);

  if (!schema.datePublished) {
    warnings.push(`${p}: Missing datePublished`);
  } else if (Number.isNaN(Date.parse(schema.datePublished))) {
    errors.push(
      `${p}: Invalid ISO date for datePublished: "${schema.datePublished}"`,
    );
  }

  if (!schema.author) warnings.push(`${p}: Missing author`);
  if (!schema.image) warnings.push(`${p}: Missing image (Rich Results)`);

  validateNested("author");
  validateNested("publisher");
}

/**
 * Validates a BreadcrumbList schema
 */
function validateBreadcrumbListSchema(schema, p, errors) {
  if (!schema.itemListElement || !Array.isArray(schema.itemListElement)) {
    errors.push(`${p}: Missing or invalid itemListElement array`);
    return;
  }

  for (const [i, item] of schema.itemListElement.entries()) {
    const itemP = `${p}.itemListElement[${i}]`;
    if (!item["@type"] || item["@type"] !== "ListItem") {
      errors.push(`${itemP}: Must be ListItem`);
    }
    if (!item.position) errors.push(`${itemP}: Missing position`);
    if (!item.name) errors.push(`${itemP}: Missing name`);
    if (!item.item) errors.push(`${itemP}: Missing item URL`);
  }
}

/**
 * Validates a single JSON-LD schema object
 */
function validateSingleSchema(schema, prefix = "") {
  const errors = [];
  const warnings = [];

  if (!schema || typeof schema !== "object") return { errors, warnings };

  if (!schema["@type"]) {
    errors.push(`${prefix ? prefix + ": " : ""}Missing @type property`);
    return { errors, warnings };
  }

  const type = schema["@type"];
  const p = prefix ? `${prefix} (${type})` : type;

  // Helper function to validate nested schemas
  const validateNested = (propName) => {
    if (!schema[propName]) return;

    if (Array.isArray(schema[propName])) {
      for (const [i, item] of schema[propName].entries()) {
        if (typeof item === "object") {
          const res = validateSingleSchema(item, `${p}.${propName}[${i}]`);
          errors.push(...res.errors);
          warnings.push(...res.warnings);
        }
      }
    } else if (typeof schema[propName] === "object") {
      const res = validateSingleSchema(schema[propName], `${p}.${propName}`);
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }
  };

  // Validate based on schema type
  switch (type) {
    case "Person": {
      validatePersonSchema(schema, p, errors, warnings);
      break;
    }
    case "WebSite": {
      validateWebSiteSchema(schema, p, errors, validateNested);
      break;
    }
    case "BlogPosting":
    case "Article": {
      validateArticleSchema(schema, p, errors, warnings, validateNested);
      break;
    }
    case "BreadcrumbList": {
      validateBreadcrumbListSchema(schema, p, errors);
      break;
    }
  }

  return { errors, warnings };
}

/**
 * Validates the @context and top-level structure
 */
function validateSchema(schema) {
  const errors = [];
  const warnings = [];

  if (schema.error) {
    errors.push(`Invalid JSON: ${schema.error}`);
    return { errors, warnings };
  }

  const context = schema["@context"];
  const hasSchemaOrg = (ctx) => {
    if (typeof ctx === "string") return ctx.includes("schema.org");
    if (Array.isArray(ctx)) return ctx.some(hasSchemaOrg);
    if (ctx && typeof ctx === "object")
      return JSON.stringify(ctx).includes("schema.org");
    return false;
  };

  if (!context) {
    errors.push("Missing @context property");
  } else if (!hasSchemaOrg(context)) {
    errors.push(
      `@context should reference schema.org, found: ${JSON.stringify(context)}`,
    );
  }

  if (schema["@graph"] && Array.isArray(schema["@graph"])) {
    for (const [index, item] of schema["@graph"].entries()) {
      const result = validateSingleSchema(item, `Graph item ${index}`);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    return { errors, warnings };
  }

  return validateSingleSchema(schema);
}

/**
 * Scans all pages and performs validation
 */
async function validateAllPages() {
  console.log("🔍 Validating Schema.org JSON-LD structured data...\n");

  const files = await glob(`${DIST_DIR}/**/*.html`, { absolute: true });
  let totalSchemas = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const fileResults = [];

  for (const file of files) {
    if (!isPathSafe(file)) {
      console.warn(`Skipping file with unsafe path: ${file}`);
      continue;
    }
    // deepcode ignore PT: file is validated by isPathSafe()
    const html = fs.readFileSync(file, "utf-8");
    const schemas = extractJsonLd(html);
    if (schemas.length === 0) continue;

    const relativePath = path.relative(DIST_DIR, file);
    const fileErrors = [];
    const fileWarnings = [];

    for (const [index, schema] of schemas.entries()) {
      const { errors, warnings } = validateSchema(schema);
      if (errors.length > 0)
        fileErrors.push({ index, type: schema["@type"], errors });
      if (warnings.length > 0)
        fileWarnings.push({ index, type: schema["@type"], warnings });
      totalErrors += errors.length;
      totalWarnings += warnings.length;
    }

    totalSchemas += schemas.length;
    // Always push if schemas exist, so we can show "Valid" pages too
    fileResults.push({
      file: relativePath,
      schemasCount: schemas.length,
      errors: fileErrors,
      warnings: fileWarnings,
      valid: fileErrors.length === 0,
      schemas: schemas, // Include raw schemas for display
    });
  }

  const report = {
    summary: {
      totalSchemas,
      totalErrors,
      totalWarnings,
      totalPages: fileResults.length,
    },
    results: fileResults,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync("schema-report.json", JSON.stringify(report, null, 2));
  console.log("✅ Written schema-report.json");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(
    `\n📊 Schema.org Summary:\n   Total schemas found: ${totalSchemas}\n   Errors: ${totalErrors}\n   Warnings: ${totalWarnings}\n`,
  );

  if (fileResults.some((r) => !r.valid || r.warnings.length > 0)) {
    for (const result of fileResults) {
      if (result.errors.length > 0 || result.warnings.length > 0) {
        console.log(`\n📄 ${result.file} (${result.schemasCount} schemas)`);
        for (const { index, type, errors } of result.errors) {
          console.log(`   ❌ Schema ${index + 1} (${type}):`);
          for (const err of errors) console.log(`      • ${err}`);
        }
        for (const { index, type, warnings } of result.warnings) {
          console.log(`   ⚠️ Schema ${index + 1} (${type}):`);
          for (const warn of warnings) console.log(`      • ${warn}`);
        }
      }
    }
  }

  if (totalErrors === 0 && totalSchemas > 0) {
    console.log("\n✅ All Schema.org structured data is valid!\n");
    process.exit(0);
  } else if (totalSchemas === 0) {
    console.log("\n⚠️ No Schema.org JSON-LD found.\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

try {
  await validateAllPages();
} catch (error) {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
}
