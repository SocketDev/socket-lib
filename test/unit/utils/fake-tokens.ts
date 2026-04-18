/**
 * @fileoverview Canonical fake tokens for tests.
 *
 * All fake-token string literals used in test fixtures live here so that:
 *  - Downstream validation (length, prefix, charset) can evolve and every
 *    test picks up the new format in one place.
 *  - The commit-msg security hook has a single, unambiguous allowlist marker
 *    to recognize (`socket-lib-test-fake-token`) instead of a patchwork of
 *    substrings like `test-token`, `fake-token`, `your_api_key_here`, etc.
 *
 * These are NOT real secrets. Any scanner that sees these strings should
 * treat them as test fixtures and skip them.
 */

/**
 * Canonical fake token for Socket API endpoints. Uses the real `sktsec_`
 * prefix so tests exercise prefix validation if it is added later.
 */
export const FAKE_SOCKET_TOKEN =
  'sktsec_socket-lib-test-fake-token_abc123_XXXXXXXXXXXXXXXXXXXXXXXXXXXX'

/**
 * Canonical fake GitHub personal access token. GitHub PATs begin with
 * `ghp_` and are ~40 chars; `gho_` for OAuth, `ghs_` for apps. This value
 * is structurally valid but contains the test marker for hook allowlisting.
 */
export const FAKE_GITHUB_TOKEN =
  'ghp_socket-lib-test-fake-token_abc123_XXXXXXXXXXXXXXXXXXXXXXXXXXXX'

/**
 * Canonical fake generic bearer token for tests that don't care about
 * a particular provider format.
 */
export const FAKE_GENERIC_TOKEN = 'socket-lib-test-fake-token_generic_abc123'
