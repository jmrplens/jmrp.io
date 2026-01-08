module.exports = {
  ci: {
    collect: {
      url: ["https://jmrp.io/"],
      numberOfRuns: 2,
      staticDistDir: null,
      settings: {
        chromeFlags: "--no-sandbox --headless",
        formFactor: process.env.FORM_FACTOR || "mobile",
        throttlingMethod: "simulate",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "lighthouse-results",
    },
  },
};
