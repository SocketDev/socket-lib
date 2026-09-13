import { REPO_ROOT } from '../../fleet/paths.mts'
import { runMain } from '../../fleet/process/run-main.mts'
import type { ScriptMeta } from '../../fleet/process/run-main.mts'
import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { getScriptLogger } from '../../fleet/process/script-output.mts'
import { writeInstalledConsumerUsage } from './cache.mts'
import { fetchConsumerUsageAggregate } from './registry.mts'

const logger = getScriptLogger()

export async function main(): Promise<void> {
  const verified = await fetchConsumerUsageAggregate(REPO_ROOT)
  writeInstalledConsumerUsage(REPO_ROOT, verified)
  logger.log(
    `Verified consumer usage aggregate ${verified.receipt.manifestDigest}`,
  )
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'installs verified public consumer usage evidence for the stub gate',
  help: 'Usage: pnpm run audit:consumer-usage',
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
