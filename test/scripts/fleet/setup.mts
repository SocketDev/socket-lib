/**
 * @file Fleet-canonical per-worker vitest setup.
 *
 *   - Network: `nock` fails closed (no test can hit the real internet); loopback
 *     stays reachable for the few tests that spin up local servers.
 *   - Keychain: live OS-keychain round-trips skip by default — they hit
 *     `security`(1) / libsecret / DPAPI and either prompt for GUI auth (locked
 *     keychain) or hang in parallel workers, turning into 5s timeouts. The
 *     per-platform mock suites at test/unit/secrets/{macos,linux,windows}.test.mts
 *     cover the same code paths through mocked spawn boundaries.
 *
 *   Override flags (set BEFORE invoking vitest):
 *   - `SOCKET_LIB_RUN_NETWORK_TESTS=1` opts in to `describeNetworkOnly` /
 *     `itNetworkOnly` blocks (live-registry integration suites).
 *   - `SOCKET_LIB_RUN_LIVE_KEYCHAIN_TESTS=1` opts in to live `security`(1) /
 *     libsecret / DPAPI round-trips.
 */
import { afterEach, beforeAll } from 'vitest'

import nock from 'nock'

// Skip `describeNetworkOnly` / `itNetworkOnly` blocks by default.
// `SOCKET_LIB_RUN_NETWORK_TESTS=1` opts a CI lane in for live-registry
// integration suites. The flag uses _SKIP_ semantics (set = skip) per
// the existing skip-helpers convention.
if (!process.env['SOCKET_LIB_RUN_NETWORK_TESTS']) {
  process.env['SOCKET_LIB_SKIP_NETWORK_TESTS'] = '1'
}

// Skip live-OS-keychain round-trip tests by default. See file-level
// docstring for the rationale.
if (!process.env['SOCKET_LIB_RUN_LIVE_KEYCHAIN_TESTS']) {
  process.env['SOCKET_SKIP_KEYCHAIN_LIVE_TESTS'] = '1'
}

beforeAll(() => {
  // Block all network access by default. Tests must register
  // explicit nock interceptors to talk to anything.
  nock.disableNetConnect()
  // Loopback stays reachable so local-server tests work.
  nock.enableNetConnect((host: string) => {
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '[::1]' ||
      host.startsWith('127.0.0.1:') ||
      host.startsWith('localhost:') ||
      host.startsWith('[::1]:')
    )
  })
})

afterEach(() => {
  // Clear any leftover interceptors so a test's missed `.cleanAll()`
  // doesn't pollute the next test's mock surface.
  nock.cleanAll()
})
