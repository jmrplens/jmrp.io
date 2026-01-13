/**
 * scripts/ci/utils.mjs
 *
 * Shared utilities for CI reporting and dashboard generation.
 */

import fs from "node:fs";

/**
 * Calculates the project health score based on CI job outcomes and artifact data.
 *
 * @param {Object} saOutcomes - Static analysis job results (e.g., { astro: 'success', ... })
 * @param {Object} qualityOutcomes - Quality/Performance job results
 * @returns {number} Health score from 0 to 100
 */
export function calculateHealthScore(saOutcomes = {}, qualityOutcomes = {}) {
  let score = 100;

  // Deduction for SA failures (-5 each)
  for (const [key, value] of Object.entries(saOutcomes)) {
    // jsdocCoverage is currently experimental/informational
    if (value === "failure" && key !== "jsdocCoverage") {
      score -= 5;
    }
  }

  // Deduction for Quality failures (-10 each)
  for (const [, outcome] of Object.entries(qualityOutcomes)) {
    if (outcome === "failure") {
      score -= 10;
    }
  }

  // Finer deductions from JSON data artifacts if available
  try {
    if (fs.existsSync("accessibility-report.json")) {
      const accessibilityData = JSON.parse(
        fs.readFileSync("accessibility-report.json", "utf-8"),
      );

      if (Array.isArray(accessibilityData)) {
        const totalViolations = accessibilityData.reduce(
          (acc, r) => acc + (r.violations?.length || 0),
          0,
        );
        // Cap deduction at 20 points
        score -= Math.min(20, totalViolations * 2);
      }
    }
  } catch (error) {
    console.error("Error reading accessibility-report.json:", error.message);
  }

  try {
    if (fs.existsSync("html-validation.json")) {
      const htmlValidation = JSON.parse(
        fs.readFileSync("html-validation.json", "utf-8"),
      );

      if (Array.isArray(htmlValidation)) {
        const htmlErrors = htmlValidation.reduce((acc, f) => {
          // Support both standard html-validate format and simplified report format
          // Use Number() to prevent string concatenation
          const count =
            f.errorCount === undefined
              ? Number(f.messages?.filter((m) => m.severity === 2).length) || 0
              : Number(f.errorCount) || 0;
          return acc + count;
        }, 0);
        // Cap deduction at 15 points
        score -= Math.min(15, htmlErrors);
      }
    }
  } catch (error) {
    console.error("Error reading html-validation.json:", error.message);
  }

  return Math.max(0, Math.min(100, score));
}
