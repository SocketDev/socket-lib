/**
 * @fileoverview Check script for the lib.
 * Runs all quality checks in parallel:
 * - Biome (linting)
 * - TypeScript type checking
 *
 * Usage:
 *   node scripts/check.mjs
 */

import {
  printError,
  printFooter,
  printHeader,
  printSuccess,
} from './utils/cli-helpers.mjs'
import { runParallel } from './utils/run-command.mjs'

async function main() {
  try {
    printHeader('Code Checks')

    const checks = [
      {
        args: ['exec', 'biome', 'check', '.'],
        command: 'pnpm',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['exec', 'tsgo', '--noEmit'],
        command: 'pnpm',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate-no-link-deps.mjs'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate-bundle-deps.mjs'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate-esbuild-minify.mjs'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
    ]

    const exitCodes = await runParallel(checks)
    const failed = exitCodes.some(code => code !== 0)

    if (failed) {
      printError('Some checks failed')
      process.exitCode = 1
    } else {
      printSuccess('All checks passed')
      printFooter()
    }
  } catch (error) {
    printError(`Check failed: ${error.message}`)
    process.exitCode = 1
  }
}

main().catch(console.error)
