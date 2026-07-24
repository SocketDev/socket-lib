/**
 * @file Repo-tier vitest setup — the seam the fleet-canonical vitest config
 *   loads (`setupFiles: ['test/fleet/scripts/setup.mts',
 *   'test/repo/scripts/setup.mts']`). Defers to the repo's long-standing setup
 *   module so the network-test skip default, keychain-test skip, and nock
 *   lifecycle keep applying under the cascaded config. Loaded at
 *   setupFile-import time — i.e. before any `test/**` module (and its
 *   import-time `describeNetworkOnly` gate) is evaluated — so
 *   `SOCKET_LIB_SKIP_NETWORK_TESTS` is already set when `skip-helpers` reads
 *   it. Without this file the config's `existsSync` filter silently dropped the
 *   repo-tier setup, the skip env was never set, and `[network]` suites ran
 *   live against a fail-closed nock and flaked.
 */

import '../../../.config/vitest-setup-tests.mts'
