/** @type {import('astro-expressive-code').AstroExpressiveCodeOptions} */
export default {
  themes: ["github-dark", "github-light"],
  // Disable built-in copy button as it generates invalid HTML (div inside button)
  // and we use our own custom CopyButton component.
  frames: {
    showCopyToClipboardButton: false,
  },
  // Dynamic theme selector based on data-theme attribute
  themeCssSelector: (theme, { styleVariants }) => {
    if (styleVariants.length >= 2) {
      const baseTheme = styleVariants[0].theme;
      const altTheme = styleVariants.find(
        (v) => v.theme.type !== baseTheme.type,
      )?.theme;
      if (theme === baseTheme || theme === altTheme)
        return `[data-theme='${theme.type}']`;
    }
    return `[data-theme='${theme.name}']`; // Fallback
  },
  useThemedScrollbars: false,
  useThemedSelection: false,
  styleOverrides: {
    codeFontFamily: "var(--font-mono)",
    uiFontFamily: "var(--font-sans)",
  },
};
