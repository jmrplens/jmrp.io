/**
 * Job-search fields of the CV basics, for the PDF generators.
 *
 * `availability` and `objetivo` are published only while `showJobSearch` is
 * true. The website applies the same rule in the `cv` collection schema
 * (src/content.config.ts); the generators read the YAML with js-yaml, which
 * knows nothing of that schema, so they go through this helper instead.
 */

/**
 * Returns the basics with the job-search fields removed unless
 * `showJobSearch` is exactly `true`.
 *
 * @param {Record<string, unknown>} basics - The CV's `basics` as parsed YAML.
 * @returns {Record<string, unknown>} The basics as they may be published.
 */
export function publishableBasics(basics) {
  if (basics.showJobSearch === true) return basics;
  const rest = { ...basics };
  delete rest.availability;
  delete rest.objetivo;
  return rest;
}
