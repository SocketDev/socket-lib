/**
 * @file Bundle external dependencies into standalone zero-dependency modules.
 *   This bundles packages like cacache, pacote, make-fetch-happen into
 *   dist/external. Entry point that wraps the modular build-externals system.
 */

import process from 'node:process'

import { isQuiet } from '../flags/predicates.mts'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getScriptLogger } from '../../fleet/process/script-output.mts'
import { pluralize } from '@socketsecurity/lib-stable/words/pluralize'

import { buildExternals } from '../build-externals/orchestrator.mts'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { isJsonRequested, runMain } from '../../fleet/process/run-main.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'

const logger = getScriptLogger()

async function main(): Promise<void> {
  // Check for verbose mode via isVerbose or manual check
  const verbose = process.argv.includes('--verbose')
  const quiet = isQuiet() || isJsonRequested(process.argv.slice(2))

  try {
    const { bundledCount } = await buildExternals({ verbose, quiet })

    if (!quiet) {
      const title =
        bundledCount > 0
          ? `External Bundles (${bundledCount} ${pluralize('package', { count: bundledCount })})`
          : 'External Bundles (no packages)'
      logger.success(title)
    }
  } catch (error) {
    logger.error(`Build failed: ${errorMessage(error)}`)
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'bundles external dependencies (cacache, pacote, make-fetch-happen, …) into standalone modules',
  help: `Usage: node scripts/repo/build/externals.mts [flags]

  --verbose             show detailed build output
  --quiet, --silent     suppress progress messages`,
  json: 'result',
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
