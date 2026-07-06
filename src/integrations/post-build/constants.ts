/** Length of the hash used for generated style classes. */
export const STYLE_CLASS_HASH_LENGTH = 4;
/** Length of the hash used for extracted asset filenames. */
export const ASSET_FILENAME_HASH_LENGTH = 16;
/** Directory within 'dist' where extracted assets (from data URIs) are stored. */
export const ASSETS_DIR = "assets/extracted";

/**
 * Placeholder substituted by Nginx's `sub_filter` directive with the
 * per-request CSP nonce, injected into every inline/external `<script>` and
 * `<style>` tag's `nonce` attribute during HTML post-processing.
 */
export const NGINX_CSP_NONCE_PLACEHOLDER = "NGINX_CSP_NONCE";

/**
 * Nginx variable name referenced inside the generated CSP header value
 * (`security_headers.conf`), resolved natively by Nginx at request time.
 * Distinct from {@link NGINX_CSP_NONCE_PLACEHOLDER}: this one is a live
 * Nginx variable interpolated into `add_header`, not text substituted via
 * `sub_filter` inside the HTML body.
 */
export const NGINX_CSP_NONCE_VARIABLE = "$cspNonce";
