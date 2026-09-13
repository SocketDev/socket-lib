import { writeFileSync } from 'node:fs'
import { REPO_ROOT } from '../../fleet/paths.mts'
import { runMain } from '../../fleet/process/run-main.mts'
import type { ScriptMeta } from '../../fleet/process/run-main.mts'
import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { getScriptLogger } from '../../fleet/process/script-output.mts'
import { writeInstalledConsumerUsage } from './cache.mts'
import { fetchConsumerUsageAggregate } from './registry.mts'
import {
  graphSafeStubCandidates,
  rosterRepoNames,
} from '../audit-fleet-lib-usage.mts'
import { aggregateFleetUsageReport } from '../consumer-usage-aggregate.mts'
import { writeUnexposedLeaves } from '../build-stubs/settings.mts'
import { readUnexposedLeaves } from '../build-stubs/unexposed.mts'

const logger = getScriptLogger()

export function writeConsumerStubList(
  repoRoot: string,
  aggregate: Parameters<typeof aggregateFleetUsageReport>[1],
): void {
  const report = aggregateFleetUsageReport(repoRoot, aggregate)
  const safe = new Set(graphSafeStubCandidates(repoRoot, report))
  writeUnexposedLeaves(
    repoRoot,
    {
      leaves: readUnexposedLeaves(repoRoot).filter(leaf => safe.has(leaf)),
      scannedRoster: rosterRepoNames(repoRoot).toSorted(),
    },
    writeFileSync,
  )
}

export async function main(): Promise<void> {
  const verified = await fetchConsumerUsageAggregate(REPO_ROOT)
  writeInstalledConsumerUsage(REPO_ROOT, verified)
  if (process.argv.includes('--write-stub-list')) {
    writeConsumerStubList(REPO_ROOT, verified.aggregate)
  }
  logger.log(
    `Verified consumer usage aggregate ${verified.receipt.manifestDigest}`,
  )
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'installs verified public consumer usage evidence for the stub gate',
  help: `Usage: pnpm run audit:consumer-usage [flags]

  --write-stub-list   write graph-safe candidates from verified evidence`,
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
