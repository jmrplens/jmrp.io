#!/usr/bin/env node

/**
 * Schema.org JSON-LD Validator
 * Extracts and validates structured data from HTML pages
 */

import fs from "fs";
import path from "path";
import { glob } from "glob";

const DIST_DIR = process.argv[2] || "dist";

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

function validateSingleSchema(schema, prefix = "") {
    const errors = [];
    const warnings = [];

    // Check @type
    if (!schema["@type"]) {
        errors.push(`${prefix ? prefix + ": " : ""}Missing @type property`);
        return { errors, warnings };
    }

    // Type-specific validation
    const type = schema["@type"];
    const p = prefix ? `${prefix} (${type})` : type;

    switch (type) {
        case "Person":
            if (!schema.name) errors.push(`${p}: Missing name`);
            if (!schema.url) warnings.push(`${p}: Missing url`);
            break;

        case "WebSite":
            if (!schema.name) errors.push(`${p}: Missing name`);
            if (!schema.url) errors.push(`${p}: Missing url`);
            break;

        case "BlogPosting":
        case "Article":
            if (!schema.headline) errors.push(`${p}: Missing headline`);
            if (!schema.datePublished)
                warnings.push(`${p}: Missing datePublished`);
            if (!schema.author) warnings.push(`${p}: Missing author`);
            break;

        case "BreadcrumbList":
            if (!schema.itemListElement) {
                errors.push(`${p}: Missing itemListElement`);
            } else if (!Array.isArray(schema.itemListElement)) {
                errors.push(`${p}: itemListElement must be an array`);
            }
            break;

        case "SiteNavigationElement":
            // Valid type, just needs name and url
            if (!schema.name) warnings.push(`${p}: Missing name`);
            if (!schema.url) warnings.push(`${p}: Missing url`);
            break;
    }

    return { errors, warnings };
}

function validateSchema(schema, filePath) {
    const errors = [];
    const warnings = [];

    if (schema.error) {
        errors.push(`Invalid JSON: ${schema.error}`);
        return { errors, warnings };
    }

    // Check @context
    if (!schema["@context"]) {
        errors.push("Missing @context property");
    } else if (!schema["@context"].includes("schema.org")) {
        errors.push(
            `@context should reference schema.org, found: ${schema["@context"]}`,
        );
    }

    // Handle @graph (array of schemas)
    if (schema["@graph"] && Array.isArray(schema["@graph"])) {
        schema["@graph"].forEach((item, index) => {
            const result = validateSingleSchema(item, `Graph item ${index}`);
            errors.push(...result.errors);
            warnings.push(...result.warnings);
        });
        return { errors, warnings };
    }

    // Single schema validation
    const result = validateSingleSchema(schema);
    return result;
}

async function validateAllPages() {
    console.log("🔍 Validating Schema.org JSON-LD structured data...\n");

    // Find all HTML files
    const files = await glob(`${DIST_DIR}/**/*.html`);
    console.log(`   Found ${files.length} HTML files\n`);

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
            const { errors, warnings } = validateSchema(schema, file);

            if (errors.length > 0) {
                fileErrors.push({ index, type: schema["@type"], errors });
            }
            if (warnings.length > 0) {
                fileWarnings.push({ index, type: schema["@type"], warnings });
            }

            totalErrors += errors.length;
            totalWarnings += warnings.length;
        });

        totalSchemas += schemas.length;

        if (fileErrors.length > 0 || fileWarnings.length > 0) {
            fileResults.push({
                file: relativePath,
                schemasCount: schemas.length,
                errors: fileErrors,
                warnings: fileWarnings,
            });
        }
    }

    // Report results
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`\n📊 Schema.org Validation Summary:\n`);
    console.log(`   Total schemas found: ${totalSchemas}`);
    console.log(
        `   Files with schemas: ${fileResults.length > 0 ? fileResults.length : files.filter((f) => extractJsonLd(fs.readFileSync(f, "utf-8")).length > 0).length}`,
    );
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Warnings: ${totalWarnings}\n`);

    if (fileResults.length > 0) {
        fileResults.forEach((result) => {
            console.log(
                `\n📄 ${result.file} (${result.schemasCount} schema${result.schemasCount > 1 ? "s" : ""})`,
            );

            result.errors.forEach(({ index, type, errors }) => {
                console.log(`\n   ❌ Schema ${index + 1} (${type}):`);
                errors.forEach((err) => console.log(`      • ${err}`));
            });

            result.warnings.forEach(({ index, type, warnings }) => {
                console.log(`\n   ⚠️  Schema ${index + 1} (${type}):`);
                warnings.forEach((warn) => console.log(`      • ${warn}`));
            });
        });
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (totalErrors === 0 && totalSchemas > 0) {
        console.log("\n✅ All Schema.org structured data is valid!\n");
        process.exit(0);
    } else if (totalSchemas === 0) {
        console.log("\n⚠️  No Schema.org JSON-LD found in any page\n");
        process.exit(0);
    } else {
        console.log("\n❌ Schema.org validation failed\n");
        process.exit(1);
    }
}

validateAllPages().catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
});
