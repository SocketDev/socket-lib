/**
 * @file Bundle external dependencies into standalone zero-dependency modules.
 *   This bundles packages like cacache, pacote, make-fetch-happen into
 *   dist/external. Entry point that wraps the modular build-externals system.
 */

import process from 'node:process'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { pluralize } from '@socketsecurity/lib-stable/words/pluralize'

import { buildExternals } from '../build-externals/orchestrator.mts'

import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

async function main(): Promise<void> {
  // Check for verbose mode via isVerbose or manual check
  const verbose = process.argv.includes('--verbose')
  const quiet = isQuiet()

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
    logger.error(`Build failed: ${error.message || error}`)
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'bundles external dependencies (cacache, pacote, make-fetch-happen, …) into standalone modules',
  help: `Usage: node scripts/repo/bundle/externals.mts [flags]

  --verbose             show detailed build output
  --quiet, --silent     suppress progress messages`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
