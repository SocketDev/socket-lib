/**
 * @file Repo-tier vitest setup — the seam the fleet-canonical vitest config
 *   loads (`test/scripts/repo/setup.mts`). Defers to the repo's long-standing
 *   setup module so the network-test skip default, keychain-test skip, and
 *   nock lifecycle keep applying under the cascaded config.
 */

import '../../../.config/vitest-setup-tests.mts'
