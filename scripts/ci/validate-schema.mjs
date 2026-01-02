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
import { glob } from "glob";

const DIST_DIR = process.argv[2] || "dist";

/**
 * Extracts JSON-LD scripts from HTML content
 */
function extractJsonLd(html) {
  const scripts =
    html.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
    ) || [];
  return scripts.map((script) => {
    const content = script
      .replace(/<script[^>]*>/, "")
      .replace(/<\/script>/, "")
      .trim();
    try {
      return JSON.parse(content);
    } catch (e) {
      return { error: e.message, raw: content };
    }
  });
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

  const checkUrl = (url, name) => {
    try {
      new URL(url);
    } catch {
      warnings.push(`${p}: Invalid URL for ${name}: "${url}"`);
    }
  };

  const checkDate = (date, name) => {
    if (isNaN(Date.parse(date)))
      errors.push(`${p}: Invalid ISO date for ${name}: "${date}"`);
  };

  const validateNested = (propName) => {
    if (schema[propName]) {
      if (Array.isArray(schema[propName])) {
        schema[propName].forEach((item, i) => {
          if (typeof item === "object") {
            const res = validateSingleSchema(item, `${p}.${propName}[${i}]`);
            errors.push(...res.errors);
            warnings.push(...res.warnings);
          }
        });
      } else if (typeof schema[propName] === "object") {
        const res = validateSingleSchema(schema[propName], `${p}.${propName}`);
        errors.push(...res.errors);
        warnings.push(...res.warnings);
      }
    }
  };

  switch (type) {
    case "Person":
      if (!schema.name) errors.push(`${p}: Missing name`);
      if (schema.url) checkUrl(schema.url, "url");
      break;
    case "WebSite":
      if (!schema.name) errors.push(`${p}: Missing name`);
      if (!schema.url) errors.push(`${p}: Missing url`);
      validateNested("publisher");
      break;
    case "BlogPosting":
    case "Article":
      if (!schema.headline) errors.push(`${p}: Missing headline`);
      if (!schema.datePublished) warnings.push(`${p}: Missing datePublished`);
      else checkDate(schema.datePublished, "datePublished");
      if (!schema.author) warnings.push(`${p}: Missing author`);
      if (!schema.image) warnings.push(`${p}: Missing image (Rich Results)`);
      validateNested("author");
      validateNested("publisher");
      break;
    case "BreadcrumbList":
      if (!schema.itemListElement || !Array.isArray(schema.itemListElement)) {
        errors.push(`${p}: Missing or invalid itemListElement array`);
      } else {
        schema.itemListElement.forEach((item, i) => {
          const itemP = `${p}.itemListElement[${i}]`;
          if (!item["@type"] || item["@type"] !== "ListItem")
            errors.push(`${itemP}: Must be ListItem`);
          if (!item.position) errors.push(`${itemP}: Missing position`);
          if (!item.name) errors.push(`${itemP}: Missing name`);
          if (!item.item) errors.push(`${itemP}: Missing item URL`);
        });
      }
      break;
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

  if (!schema["@context"]) {
    errors.push("Missing @context property");
  } else if (!schema["@context"].includes("schema.org")) {
    errors.push(
      `@context should reference schema.org, found: ${schema["@context"]}`,
    );
  }

  if (schema["@graph"] && Array.isArray(schema["@graph"])) {
    schema["@graph"].forEach((item, index) => {
      const result = validateSingleSchema(item, `Graph item ${index}`);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
    return { errors, warnings };
  }

  return validateSingleSchema(schema);
}

/**
 * Scans all pages and performs validation
 */
async function validateAllPages() {
  console.log("🔍 Validating Schema.org JSON-LD structured data...\n");

  const files = await glob(`${DIST_DIR}/**/*.html`);
  let totalSchemas = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  const fileResults = [];

  for (const file of files) {
    const html = fs.readFileSync(file, "utf-8");
    const schemas = extractJsonLd(html);
    if (schemas.length === 0) continue;

    const relativePath = path.relative(DIST_DIR, file);
    const fileErrors = [];
    const fileWarnings = [];

    schemas.forEach((schema, index) => {
      const { errors, warnings } = validateSchema(schema);
      if (errors.length > 0)
        fileErrors.push({ index, type: schema["@type"], errors });
      if (warnings.length > 0)
        fileWarnings.push({ index, type: schema["@type"], warnings });
      totalErrors += errors.length;
      totalWarnings += warnings.length;
    });

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
    fileResults.forEach((result) => {
      if (result.errors.length > 0 || result.warnings.length > 0) {
        console.log(`\n📄 ${result.file} (${result.schemasCount} schemas)`);
        result.errors.forEach(({ index, type, errors }) => {
          console.log(`   ❌ Schema ${index + 1} (${type}):`);
          errors.forEach((err) => console.log(`      • ${err}`));
        });
        result.warnings.forEach(({ index, type, warnings }) => {
          console.log(`   ⚠️ Schema ${index + 1} (${type}):`);
          warnings.forEach((warn) => console.log(`      • ${warn}`));
        });
      }
    });
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

validateAllPages().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
