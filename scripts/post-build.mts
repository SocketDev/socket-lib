/**
 * @file Orchestrates the post-build steps that shape the published dist:
 *   package-exports generation, CJS-export rewrite, external-import rewrite,
 *   and the dist/export validators. Deliberately does NOT generate docs — the
 *   api-index.md doc-gen is committed-source output unrelated to the dist, so
 *   it lives in its own `pnpm run docs` script and must not run on every
 *   `prepare`/install build (see scripts/repo/make-api-index-md.mts).
 */

import process from 'node:process'
import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printFooter } from '@socketsecurity/lib-stable/stdio/footer'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { runSequence } from './fleet/util/run-command.mts'

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
      args: ['scripts/post-build/make-package-exports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/post-build/rewrite-external-imports.mts', ...fixArgs],
      command: 'node',
    },
    {
      args: ['scripts/post-build/rewrite-cjs-exports.mts', ...fixArgs],
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
