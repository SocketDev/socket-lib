/**
 * @fileoverview Orchestrates all post-build fix scripts.
 * Runs generate-package-exports and fix-external-imports in sequence.
 */

import { isQuiet } from './utils/flags.mjs'
import { printError, printFooter, printHeader } from './utils/helpers.mjs'
import { runSequence } from './utils/run-command.mjs'

async function main() {
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
      args: ['scripts/generate-package-exports.mjs', ...fixArgs],
      command: 'node',
    },
    // fix-commonjs-exports no longer needed - unminified esbuild output is ESM-compatible
    {
      args: ['scripts/fix-external-imports.mjs', ...fixArgs],
      command: 'node',
    },
  ])

  if (!quiet) {
    printFooter()
  }

  if (exitCode !== 0) {
    printError('Build fixing failed')
    process.exitCode = exitCode
  }
}

main().catch(error => {
  printError(`Build fixing failed: ${error.message || error}`)
  process.exitCode = 1
})
