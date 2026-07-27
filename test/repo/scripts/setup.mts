/**
 * @file Repo-specific vitest setup, wired via `setupFiles` in
 *   `.config/repo/vitest.config.mts` alongside the fleet-canonical
 *   `test/fleet/scripts/setup.mts`. Holds socket-lib's default test-lane
 *   opt-outs: live-network and live-keychain suites skip unless a lane opts in.
 *   The env is set at module top level so it lands before test collection reads
 *   it (the `describeNetworkOnly` / `itNetworkOnly` gates in
 *   `test/unit/util/skip-helpers.ts`). Fleet-wide concerns — nock fail-closed,
 *   git-env isolation, custom matchers — live in the fleet setup file.
 */

import process from 'node:process'

// Skip `describeNetworkOnly` / `itNetworkOnly` suites by default. The fleet
// setup fails network closed (nock.disableNetConnect), so a live-registry suite
// that ran here would throw; `SOCKET_LIB_RUN_NETWORK_TESTS=1` opts a lane in for
// the real integration suites. `_SKIP_` semantics (set = skip) match
// skip-helpers.ts.
if (!process.env['SOCKET_LIB_RUN_NETWORK_TESTS']) {
  process.env['SOCKET_LIB_SKIP_NETWORK_TESTS'] = '1'
}

// Skip live-OS-keychain round-trip tests by default. They hit `security`(1) /
// libsecret / DPAPI directly and either prompt for GUI auth or hang in
// headless / parallel-worker runs; the mocked per-platform suites at
// test/unit/secrets/{macos,linux,windows}.test.mts cover the same code paths.
// `SOCKET_LIB_RUN_LIVE_KEYCHAIN_TESTS=1` opts a manual session in.
if (!process.env['SOCKET_LIB_RUN_LIVE_KEYCHAIN_TESTS']) {
  process.env['SOCKET_SKIP_KEYCHAIN_LIVE_TESTS'] = '1'
}
