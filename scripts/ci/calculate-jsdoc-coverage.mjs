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
 * Simple logger that mimics Astro's integration logger for consistency across the CI scripts.
 */
const logger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

/**
 * Calculates JSDoc coverage across the project by scanning exported symbols.
 *
 * @returns {Promise<void>} Resolves when the report is complete.
 */
async function calculateCoverage() {
  logger.info(`🔍 Scanning src and scripts for JSDoc coverage...`);

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

  const checker = program.getTypeChecker();
  let totalExported = 0;
  let documented = 0;

  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) continue;

    // Get nodes that are explicitly or implicitly exported at the module level
    const exportedNodes = getExportedNodes(sourceFile, checker);

    /**
     * Recursive visitor to find documentable symbols in public API.
     * @param {ts.Node} node - Current node.
     * @param {boolean} isParentPublic - Whether the parent is public.
     */
    const visit = (node, isParentPublic = false) => {
      // Logic for determining if this specific node is "publicly accessible"
      let isPublic = isParentPublic || exportedNodes.has(node);

      // In classes/interfaces/enums, check visibility modifiers
      if (isParentPublic) {
        const flags = ts.getCombinedModifierFlags(node);
        if (
          (flags & ts.ModifierFlags.Private) !== 0 ||
          (flags & ts.ModifierFlags.Protected) !== 0
        ) {
          isPublic = false;
        }
      }

      if (isPublic && isDocumentable(node)) {
        totalExported++;
        if (hasJSDoc(node, sourceFile)) {
          documented++;
        } else {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile),
          );
          logger.warn(
            `  ⚠️ Missing JSDoc: ${file}:${line + 1}:${character + 1}`,
          );
        }
      }

      // Determine if children should be considered public by default
      const nextParentPublic = checkParentPublic(node, isPublic);

      ts.forEachChild(node, (n) => visit(n, nextParentPublic));
    };

    ts.forEachChild(sourceFile, (n) => visit(n, false));
  }

  const percentage =
    totalExported === 0 ? 100 : (documented / totalExported) * 100;
  const formattedPercentage = percentage.toFixed(1);

  logger.info("\n📊 JSDoc Total Coverage Report");
  logger.info("===============================");
  logger.info(`Files Scanned: ${files.length}`);
  logger.info(`Total Exported Documentable Symbols: ${totalExported}`);
  logger.info(`Documented: ${documented}`);
  logger.info(`Coverage: ${formattedPercentage}%`);
  logger.info("===============================\n");

  // Output for CI environment
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `JSDOC_COVERAGE=${formattedPercentage}\n`,
    );
  }

  // Also write to a temp file for other scripts to pick up if needed
  try {
    fs.writeFileSync(".jsdoc-coverage", `${formattedPercentage}%`);
  } catch (error) {
    logger.warn(`Failed to write .jsdoc-coverage file: ${error.message}`);
  }

  if (percentage < THRESHOLD) {
    logger.error(
      `❌ Coverage (${formattedPercentage}%) is below the threshold of ${THRESHOLD}%.`,
    );
    process.exit(1);
  } else {
    logger.info(
      `✅ Coverage (${formattedPercentage}%) meets the threshold of ${THRESHOLD}%.`,
    );
    process.exit(0);
  }
}

/**
 * Determines if children should inherit public status based on parent node type.
 * @param {ts.Node} node
 * @param {boolean} isPublic
 * @returns {boolean}
 */
function checkParentPublic(node, isPublic) {
  return (
    isPublic &&
    (ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node))
  );
}

/**
 * Identifies all nodes that are exported from a source file using the Type Checker.
 * This handles both inline exports (export function ...) and separate
 * export statements (export { foo }).
 *
 * @param sourceFile - The TS SourceFile to analyze.
 * @param checker - The TS TypeChecker instance.
 * @returns A Set of nodes that are part of the module's public API.
 */
function getExportedNodes(sourceFile, checker) {
  const exportedNodes = new Set();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];

  for (const exp of exports) {
    const declarations = exp.getDeclarations();
    if (declarations) {
      for (const decl of declarations) {
        addDeclarationToExported(decl, exportedNodes);
      }
    }
  }

  return exportedNodes;
}

/**
 * Adds a declaration and potentially its parent VariableStatement to the set of exported nodes.
 * @param {ts.Declaration} decl
 * @param {Set<ts.Node>} exportedNodes
 */
function addDeclarationToExported(decl, exportedNodes) {
  exportedNodes.add(decl);
  // If it's a VariableDeclaration, we want to track its parent VariableStatement
  // as well, since that's what we see during top-level source file iteration.
  if (ts.isVariableDeclaration(decl)) {
    const varList = decl.parent;
    if (varList && ts.isVariableDeclarationList(varList)) {
      const varStatement = varList.parent;
      if (varStatement && ts.isVariableStatement(varStatement)) {
        exportedNodes.add(varStatement);
      }
    }
  }
}

/**
 * Determines if a TypeScript node should have JSDoc documentation.
 *
 * @param node - The TS Node to check.
 * @returns True if the node is a function, class, interface, etc.
 */
function isDocumentable(node) {
  // Common documentable nodes
  const isBaseDocumentable =
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isEnumMember(node) ||
    ts.isAccessor(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertySignature(node);

  if (isBaseDocumentable) return true;

  // Exported const functions (arrow functions) in VariableStatements
  return (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (d) =>
        d.initializer &&
        (ts.isArrowFunction(d.initializer) ||
          ts.isFunctionExpression(d.initializer)),
    )
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

try {
  await calculateCoverage();
} catch (error) {
  logger.error(`Fatal error: ${error.message || String(error)}`);
  process.exit(1);
}
