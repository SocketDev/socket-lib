/**
 * @file Socket-lib-specific coverage configuration. Composes the fleet baseline
 *   from vitest.coverage.fleet.config.mts with lib-specific exclusions
 *   (Arborist orchestration + DLX heavy paths that need integration tests, not
 *   units) and lib's cumulative thresholds. The aggregate gate lives in
 *   scripts/test/cover.mts, which reads coverage-final.json from both the main
 *   \+ isolated suites and merges via max-hit-count before checking
 *   aggregateCoverageThresholds below.
 */

import type { CoverageOptions } from 'vitest'

import {
  baseFleetAggregateThresholds,
  baseFleetCoverageConfig,
} from './fleet/vitest.coverage.fleet.config.mts'

/**
 * Lib-specific src/ files excluded from coverage. Each entry needs a one-line
 * rationale — drift watch: if the underlying file changes shape, confirm the
 * exclusion still applies.
 */
const libSpecificExcludes = [
  // Arborist wrapper — every code path delegates to the npm Arborist
  // library (network calls, registry lookups, lockfile writes).
  // Meaningful coverage requires integration tests against a live
  // registry, not unit tests.
  'src/dlx/arborist.ts',
  // generatePackagePin orchestration — requires real Arborist resolution +
  // httpDownload of the top-level tarball. Same integration-test boundary
  // as arborist.ts.
  'src/dlx/lockfile.ts',
  // dlxPackage / downloadPackage / ensurePackageInstalled — Arborist
  // install + Firewall API orchestration. The pure helpers
  // (parsePackageSpec, npmPurl, findBinaryPath, executePackage,
  // makePackageBinsExecutable) are already unit-tested. The remaining
  // orchestration is integration-test territory.
  'src/dlx/package.ts',
  // dlxBinary / downloadBinary orchestration — full http download +
  // extract + cache flow. Pure parts (downloadBinaryFile, executeBinary,
  // getBinaryCacheMetadataPath, getDlxCachePath) are unit-tested. The
  // orchestration needs integration tests.
  'src/dlx/binary.ts',
]

/**
 * Base coverage config for socket-lib: fleet defaults + lib-specific exclusions
 * layered on top.
 */
export const baseCoverageConfig: CoverageOptions = {
  ...baseFleetCoverageConfig,
  exclude: [...(baseFleetCoverageConfig.exclude ?? []), ...libSpecificExcludes],
}

/**
 * Cumulative aggregate threshold for socket-lib. Currently matches the fleet
 * default — kept as an explicit re-export so a future lib-specific bump (or
 * relax) is one edit, not a config restructure.
 */
export const aggregateCoverageThresholds = baseFleetAggregateThresholds
