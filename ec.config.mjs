export default {
    themes: ['github-dark', 'github-light'],
    // Dynamic theme selector based on data-theme attribute
    themeCssSelector: (theme, { styleVariants }) => {
        if (styleVariants.length >= 2) {
            const baseTheme = styleVariants[0].theme;
            const altTheme = styleVariants.find((v) => v.theme.type !== baseTheme.type)?.theme;
            if (theme === baseTheme || theme === altTheme) return `[data-theme='${theme.type}']`;
        }
        return `[data-theme='${theme.name}']`; // Fallback
    },
};
