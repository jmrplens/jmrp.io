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
const SRC_DIR = "src";

async function calculateCoverage() {
  console.log(`🔍 Scanning ${SRC_DIR} for JSDoc coverage...`);

  // Find all TS/TSX files
  const files = await glob(`${SRC_DIR}/**/*.{ts,tsx}`, {
    ignore: ["**/*.d.ts", "**/*.test.ts", "**/*.spec.ts"],
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

  console.log("\n📊 JSDoc Coverage Report");
  console.log("========================");
  console.log(`Files Scanned: ${files.length}`);
  console.log(`Exported Symbols: ${totalExported}`);
  console.log(`Documented: ${documented}`);
  console.log(`Coverage: ${formattedPercentage}%
`);
  console.log("========================\n");

  // Output for CI environment
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `jsdoc_coverage=${formattedPercentage}%\n`,
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

function isExported(node) {
  return (
    (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0 ||
    (!!node.parent && node.parent.kind === ts.SyntaxKind.SourceFile)
  );
}

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
