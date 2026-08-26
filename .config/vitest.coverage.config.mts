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
  // library, which does network calls, registry lookups, and lockfile
  // writes. Meaningful coverage requires integration tests against a
  // live registry, not unit tests.
  'src/dlx/arborist.mts',
  // generatePackagePin orchestration — requires real Arborist resolution +
  // httpDownload of the top-level tarball. Same integration-test boundary
  // as arborist.ts.
  'src/dlx/lockfile.mts',
  // dlxPackage / downloadPackage / ensurePackageInstalled — Arborist
  // install + Firewall API orchestration. The pure helpers
  // (parsePackageSpec, npmPurl, findBinaryPath, executePackage,
  // makePackageBinsExecutable) are already unit-tested. The remaining
  // orchestration is integration-test territory.
  'src/dlx/package.mts',
  // dlxBinary / downloadBinary orchestration — full http download +
  // extract + cache flow. Pure parts (downloadBinaryFile, executeBinary,
  // getBinaryCacheMetadataPath, getDlxCachePath) are unit-tested. The
  // orchestration needs integration tests.
  'src/dlx/binary.mts',
]

// `src/perf/**` is excluded via the `coverage.exclude.add` overlay in
// `.config/repo/socket-wheelhouse.json`, which is the one surface both the
// vitest tiers and the c8 children tier read. Rationale: the fleet baseline
// already excludes `perf/**` and vitest honours it — the main and isolated
// tiers report ZERO files under `src/perf/`. The children tier runs through
// c8's programmatic Report, whose matcher anchors that glob differently, so a
// spawned child that happens to load `src/perf/metrics.mts` leaks one entry
// into the merged aggregate. That entry is not a measurement of the file: it
// arrives UNMAPPED (122 per-line "statements" for a 46-line module) and it
// appears or vanishes with whichever children a run spawns, moving the
// aggregate by roughly half a point either way. The module is unit-tested in
// `test/unit/perf/metrics.test.mts`, so the exclusion hides no untested code —
// it only makes every tier agree with what the mapped tiers already do. Drift
// watch: drop the overlay entry once the children tier shares the mapped
// tiers' glob anchoring.

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
