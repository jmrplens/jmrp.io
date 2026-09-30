/**
 * The inline parenthetical the llms documents append to a name.
 *
 * A leaf on purpose, like `home-facts.ts`: it imports nothing, so the unit
 * test can load it directly instead of waiting for a build.
 *
 * @module
 */

/**
 * Whether the text is one parenthesized group from end to end: the "(" it
 * opens with is the one its last character closes. "(a, b)" is; "(a) and
 * (b)" is not, because its first group closes before the end.
 *
 * @param text - The text to check.
 * @returns True when wrapping it again would double the parentheses.
 */
function isWrapped(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) return false;
  const chars = [...text];
  let depth = 0;
  for (const [index, char] of chars.entries()) {
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index === chars.length - 1;
    }
  }
  return false;
}

/**
 * ` (text)`, or nothing when the value is absent.
 *
 * A value that already arrives in parentheses is used as it is. The CV's
 * skill notes are written that way in the YAML ("(multi-platform releases)"),
 * and wrapping them again printed "GoReleaser ((multi-platform releases))"
 * 21 times in each CV twin (GEO audit #11, B6).
 *
 * @param value - The text to append, or nothing.
 * @returns The parenthetical with its leading space, or an empty string.
 */
export function parenthetical(value?: string): string {
  if (!value) return "";
  return isWrapped(value) ? ` ${value}` : ` (${value})`;
}
