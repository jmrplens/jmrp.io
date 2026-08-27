/**
 * Web-side re-export of the shared download-channel helpers.
 *
 * The implementation lives in `scripts/download-sources.mjs` so the pre-build
 * integration, the CV LaTeX generators (plain Node) and the site all read the
 * same channel map. This wrapper exposes it through the `@utils` alias.
 *
 * @module
 */

export {
  compactDownloads,
  DOWNLOADS_DISPLAY_MIN,
  fetchAllDownloads,
  fetchProjectDownloads,
  type ProjectDownloads,
} from "../../scripts/download-sources.mjs";
