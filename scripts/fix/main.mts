/**
 * @fileoverview Orchestrates all post-build fix scripts.
 * Runs generate-package-exports and fix-external-imports in sequence.
 */

import process from 'node:process'
import { isQuiet } from '@socketsecurity/lib-stable/argv/flags'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'
import {
  printFooter,
  printHeader,
} from '@socketsecurity/lib-stable/stdio/header'

import { runSequence } from '../utils/run-command.mts'

const logger = getDefaultLogger()

async function main(): Promise<void> {
  const verbose = process.argv.includes('--verbose')
  const quiet = isQuiet()

  if (!quiet) {
    printHeader('Fixing Build Output')
  }

  const fixArgs = []
  if (quiet) {
    fixArgs.push('--quiet')
  }
  if (verbose) {
    fixArgs.push('--verbose')
  }

  const exitCode = await runSequence([
    {
      args: ['scripts/fix/generate-package-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/fix/external-imports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/fix/commonjs-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/validate/esm-named-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/validate/dist-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/validate/external-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/validate/external-esm-cjs.mts', ...fixArgs],
      command: 'node',
    },
  ])

  if (!quiet) {
    printFooter()
  }

  if (exitCode !== 0) {
    logger.error('Build fixing failed')
    process.exitCode = exitCode
  }
}

main().catch(error => {
  logger.error(`Build fixing failed: ${error.message || error}`)
  process.exitCode = 1
})
