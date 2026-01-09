/**
 * JSDoc Coverage Calculator
 *
 * Scans the source code using the TypeScript compiler API to calculate
 * the percentage of exported symbols (functions, classes, interfaces, types)
 * that have JSDoc documentation.
 *
 * Exits with code 1 if coverage is below the threshold (90%).
 */

import fs from "node:fs";

import { glob } from "glob";
import ts from "typescript";

const THRESHOLD = 90;

/**
 * Main function to calculate JSDoc coverage across the project.
 * Scans files, identifies documentable symbols, and checks for JSDoc.
 *
 * @returns {Promise<void>} Resolves when the report is complete.
 */
async function calculateCoverage() {
  console.log(`🔍 Scanning src and scripts for JSDoc coverage...`);

  // Find all TS/TSX/JS/MJS files
  const files = await glob(`{src,scripts}/**/*.{ts,tsx,js,mjs,cjs}`, {
    ignore: ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
    absolute: true,
  });

  const program = ts.createProgram(files, {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
  });

  let totalExported = 0;
  let documented = 0;

  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) continue;

    ts.forEachChild(sourceFile, (node) => {
      // Check ONLY exported documentable nodes (aligns with ESLint publicOnly: true)
      if (isExported(node) && isDocumentable(node)) {
        totalExported++;
        if (hasJSDoc(node, sourceFile)) {
          documented++;
        } else {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          console.warn(
            `  ⚠️ Missing JSDoc: ${file}:${line + 1}:${character + 1}`,
          );
        }
      }
    });
  }

  const percentage =
    totalExported === 0 ? 100 : (documented / totalExported) * 100;
  const formattedPercentage = percentage.toFixed(1);

  console.log("\n📊 JSDoc Total Coverage Report");
  console.log("===============================");
  console.log(`Files Scanned: ${files.length}`);
  console.log(`Total Exported Documentable Symbols: ${totalExported}`);
  console.log(`Documented: ${documented}`);
  console.log(`Coverage: ${formattedPercentage}%`);
  console.log("===============================\n");

  // Output for CI environment
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `JSDOC_COVERAGE=${formattedPercentage}\n`,
    );
  }

  // Also write to a temp file for other scripts to pick up if needed
  fs.writeFileSync(".jsdoc-coverage", `${formattedPercentage}%`);

  if (percentage < THRESHOLD) {
    console.error(
      `❌ Coverage (${formattedPercentage}%) is below the threshold of ${THRESHOLD}%.`,
    );
    process.exit(1);
  } else {
    console.log(
      `✅ Coverage (${formattedPercentage}%) meets the threshold of ${THRESHOLD}%.`,
    );
    process.exit(0);
  }
}

/**
 * Checks if a TypeScript node is exported.
 *
 * @param node - The TS Node to check.
 * @returns True if the node has an export modifier or is part of an export statement.
 */
function isExported(node) {
  // 1. Direct export modifier: export function foo() {}
  if ((ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0) {
    return true;
  }

  // 2. Check for default export: export default function() {}
  if ((ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Default) !== 0) {
    return true;
  }

  return false;
}

/**
 * Determines if a TypeScript node should have JSDoc documentation.
 *
 * @param node - The TS Node to check.
 * @returns True if the node is a function, class, interface, etc.
 */
function isDocumentable(node) {
  // Only count things that typically should have docs
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    // Exported const functions (arrow functions)
    (ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (d) =>
          d.initializer &&
          (ts.isArrowFunction(d.initializer) ||
            ts.isFunctionExpression(d.initializer)),
      ))
  );
}

/**
 * Checks if a TypeScript node has a JSDoc comment.
 *
 * @param node - The TS Node to check.
 * @param sourceFile - The source file containing the node.
 * @returns True if a JSDoc comment (starting with /**) is found.
 */
function hasJSDoc(node, sourceFile) {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.pos);

  if (!comments) return false;

  // Check if any comment is a JSDoc comment (starts with /**)
  return comments.some((comment) => {
    const commentText = sourceFile.text.substring(comment.pos, comment.end);
    return commentText.startsWith("/**");
  });
}

calculateCoverage().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
