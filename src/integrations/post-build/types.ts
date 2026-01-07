/**
 * Holds collected data for generating the Content Security Policy (CSP).
 */
export interface CspData {
  /** Set of unique SHA-512 hashes for inline styles. */
  styleHashes: Set<string>;
  /** Set of unique SHA-512 hashes for inline scripts. */
  scriptHashes: Set<string>;
  /** Set of unique external hostnames identified from image sources. */
  imageDomains: Set<string>;
}
