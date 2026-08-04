/*
 * @file Repo check — every leaf compiled out of the published build is
 *   provably fleet-unused. Two legs, both against what actually ships:
 *
 *   (a) dist bytes: a built dist module carrying the build-stub banner must
 *       be named in scripts/repo/build-stubs/unexposed-leaves.json — a stub
 *       outside the committed allowlist means the build compiled out a leaf
 *       nobody signed off on. Skipped when dist/ is absent (unbuilt tree).
 *
 *   (b) fleet usage: the committed stub list must still be graph-safe against
 *       the CURRENT roster checkouts — a listed leaf a fleet repo now imports
 *       (directly, or transitively via a used module's relative imports)
 *       would ship as a throwing stub to a real consumer. Skipped loudly when
 *       any roster checkout is missing on disk (CI has no siblings; the
 *       pre-push gate on a full checkout set is the enforcer).
 *
 *   Leg (b) exists because 6.5.1 shipped npm/meta as a throwing stub while
 *   socket-registry imported it — the audit snapshot predated the consumer,
 *   the list went stale, and nothing between build and publish re-checked it.
 *
 * Usage: node scripts/repo/check/stubbed-leaves-are-fleet-unused.mts [--quiet]
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import {
  auditFleetLibUsage,
  exportLeaves,
  graphSafeStubCandidates,
  missingRosterRepos,
  rosterRepoNames,
} from '../audit-fleet-lib-usage.mts'
import {
  readScannedRoster,
  readUnexposedLeaves,
  rosterCoverageGap,
  STUB_BANNER,
} from '../build-stubs/unexposed.mts'
import { REPO_ROOT } from '../../fleet/paths.mts'
import { isMainModule } from '../../fleet/_shared/is-main-module.mts'

const logger = getDefaultLogger()

const CHECK = '[stubbed-leaves-are-fleet-unused]'

export interface UnlistedStubFinding {
  leaf: string
  target: string
}

/**
 * Built dist modules that carry the build-stub banner without an entry in the
 * committed stub list — a compiled-out leaf nobody signed off on.
 */
export function findUnlistedStubs(repoRoot: string): UnlistedStubFinding[] {
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { exports?: Record<string, unknown> | undefined }
  const exportsMap = manifest.exports ?? {}
  const listed = new Set(readUnexposedLeaves(repoRoot))
  const findings: UnlistedStubFinding[] = []
  const keys = Object.keys(exportsMap)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i] as string
    if (!key.startsWith('./') || key.includes('*')) {
      continue
    }
    const leaf = key.slice(2)
    if (listed.has(leaf)) {
      continue
    }
    const entry = exportsMap[key]
    const target =
      typeof entry === 'string'
        ? entry
        : ((entry as { default?: string | undefined } | undefined)?.default ??
          undefined)
    if (typeof target !== 'string' || !target.endsWith('.js')) {
      continue
    }
    const distPath = path.join(repoRoot, target)
    if (!existsSync(distPath)) {
      continue
    }
    const head = readFileSync(distPath, 'utf8').slice(0, STUB_BANNER.length)
    if (head === STUB_BANNER) {
      findings.push({ leaf, target })
    }
  }
  return findings
}

export interface StaleStubFinding {
  leaf: string
  reason: string
}

/**
 * Listed stub leaves the CURRENT roster checkouts prove are not safe to stub
 * — each one would ship as a throwing stub to a real consumer, or names a
 * leaf that is no longer a public src-backed module.
 */
export function findFleetUsedStubLeaves(repoRoot: string): StaleStubFinding[] {
  const report = auditFleetLibUsage(repoRoot)
  const safe = new Set(graphSafeStubCandidates(repoRoot, report))
  const publicLeaves = new Set(exportLeaves(repoRoot))
  const listed = readUnexposedLeaves(repoRoot)
  const findings: StaleStubFinding[] = []
  for (let i = 0, { length } = listed; i < length; i += 1) {
    const leaf = listed[i] as string
    if (safe.has(leaf)) {
      continue
    }
    const usage = report.leaves[leaf]
    let reason: string
    if (usage) {
      reason = `imported by ${usage.repos.join(', ')}`
    } else if (!publicLeaves.has(leaf)) {
      reason = 'no longer in the exports map'
    } else {
      reason = 'reachable through relative imports from a fleet-used module'
    }
    findings.push({ leaf, reason })
  }
  return findings
}

export function main(): void {
  const quiet = isQuiet()
  let failed = false

  const distDir = path.join(REPO_ROOT, 'dist')
  if (existsSync(distDir)) {
    const unlisted = findUnlistedStubs(REPO_ROOT)
    if (unlisted.length > 0) {
      for (let i = 0, { length } = unlisted; i < length; i += 1) {
        const f = unlisted[i] as UnlistedStubFinding
        logger.error(`${CHECK} unlisted stub: ${f.leaf} → ${f.target}`)
      }
      logger.error(
        `${CHECK} the built dist ships throwing stubs outside the allowlist.\n` +
          '  Where: dist/ vs scripts/repo/build-stubs/unexposed-leaves.json\n' +
          `  Saw: ${unlisted.length} banner-marked dist module(s) not in the committed stub list; wanted every stub allowlisted.\n` +
          '  Fix: rebuild from a clean dist, or regenerate the list with `node scripts/repo/audit-fleet-lib-usage.mts --write-stub-list`.',
      )
      failed = true
    }
  } else if (!quiet) {
    logger.warn(
      `${CHECK} dist/ absent — stub-banner leg skipped (build first for full coverage).`,
    )
  }

  // Coverage leg. Runs even when a checkout is missing, because it compares
  // the roster the list RECORDS against the roster that exists — a question
  // answered from committed data, needing no checkout at all. It is the only
  // leg that can catch a list written before a member joined, which is a state
  // the usage leg below reads as clean.
  const coverage = rosterCoverageGap(
    rosterRepoNames(REPO_ROOT),
    readScannedRoster(REPO_ROOT),
  )
  if (coverage.missing.length > 0 || coverage.stale.length > 0) {
    const scanned = readScannedRoster(REPO_ROOT)
    logger.error(
      `${CHECK} the stub list was judged against a different fleet.\n` +
        '  Where: scripts/repo/build-stubs/unexposed-leaves.json\n' +
        `  Saw: ${scanned.length ? `recorded roster of ${scanned.length}` : 'NO recorded roster (list predates the record)'}` +
        `${coverage.missing.length ? `, never judged against ${coverage.missing.join(', ')}` : ''}` +
        `${coverage.stale.length ? `, records departed member(s) ${coverage.stale.join(', ')}` : ''};` +
        ' wanted the recorded roster to match the current one.\n' +
        '  Why: a leaf only an unjudged member imports reads as fleet-unused, gets compiled out, and throws for that member at runtime.\n' +
        '  Fix: run `node scripts/repo/audit-fleet-lib-usage.mts --write-stub-list`, commit the regenerated list, and rebuild.',
    )
    failed = true
  }

  const missing = missingRosterRepos(REPO_ROOT)
  if (missing.length === 0) {
    const stale = findFleetUsedStubLeaves(REPO_ROOT)
    if (stale.length > 0) {
      for (let i = 0, { length } = stale; i < length; i += 1) {
        const f = stale[i] as StaleStubFinding
        logger.error(`${CHECK} stale stub-list entry: ${f.leaf} (${f.reason})`)
      }
      logger.error(
        `${CHECK} the committed stub list is stale against the roster.\n` +
          '  Where: scripts/repo/build-stubs/unexposed-leaves.json\n' +
          `  Saw: ${stale.length} listed leaf/leaves the fleet now reaches; wanted every listed leaf fleet-unused.\n` +
          '  Fix: run `node scripts/repo/audit-fleet-lib-usage.mts --write-stub-list`, commit the regenerated list, and rebuild.',
      )
      failed = true
    }
  } else if (!quiet) {
    logger.warn(
      `${CHECK} ${missing.length} roster checkout(s) missing (${missing.join(', ')}) — fleet-usage leg skipped.`,
    )
  }

  if (failed) {
    process.exitCode = 1
    return
  }
  if (!quiet) {
    logger.log(
      `${CHECK} ok — every stubbed leaf is allowlisted and fleet-unused.`,
    )
  }
}

if (isMainModule(import.meta.url)) {
  main()
}
