/**
 * Holds collected data for generating the Content Security Policy (CSP).
 *
 * With the nonce-only strategy, hashes are no longer collected or included
 * in the CSP header. All scripts and styles are authorized via per-request
 * nonces injected by Nginx. Only image domains are tracked to build the
 * img-src directive.
 */
export interface CspData {
  /** Set of unique external hostnames identified from image sources. */
  imageDomains: Set<string>;
}
