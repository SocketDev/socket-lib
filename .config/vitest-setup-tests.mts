/**
 * @file Per-worker test setup. Locks down network access in the test runtime so
 *   no test accidentally hits a real host. Every test that exercises HTTP must
 *   register a `nock(...)` interceptor; anything else throws inside the test
 *   rather than escaping to the network and getting blocked by Socket Firewall
 *   mid-pre-commit (which manifested as "Blocked Hostnames (1): api.github.com"
 *   during release-script runs that incidentally re-ran an HTTP-touching test).
 *   Loopback (127.0.0.1, localhost) is allowed for the few tests that spin up a
 *   local server (e.g. uSockets integration tests). Per-test teardown clears
 *   interceptors so a missing `.cleanAll()` in one test doesn't leak into the
 *   next.
 */

import { afterEach, beforeAll } from 'vitest'

import nock from 'nock'

// Skip `describeNetworkOnly` / `itNetworkOnly` blocks by default.
// `SOCKET_LIB_RUN_NETWORK_TESTS=1` opts a CI lane in for the live-
// registry integration suites. The flag uses _SKIP_ semantics (set
// = skip) per the existing skip-helpers convention.
if (!process.env['SOCKET_LIB_RUN_NETWORK_TESTS']) {
  process.env['SOCKET_LIB_SKIP_NETWORK_TESTS'] = '1'
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
