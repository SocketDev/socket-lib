/**
 * @file Orchestrates the post-build steps that shape the published dist:
 *   package-exports generation, CJS-export rewrite, external-import rewrite,
 *   and the dist/export validators. Deliberately does NOT generate docs — the
 *   api.md doc-gen is committed-source output unrelated to the dist, so it
 *   lives in its own `pnpm run docs` script and must not run on every
 *   `prepare`/install build (see scripts/repo/make-api-md.mts).
 */

import process from 'node:process'
import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printFooter } from '@socketsecurity/lib-stable/stdio/footer'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { runSequence } from '../fleet/util/run-command.mts'

import { isMainModule } from '../fleet/_shared/is-main-module.mts'
import { runMain } from '../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

async function main(): Promise<void> {
  try {
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
      // FIRST: the exports map is built from whatever declaration names exist,
      // so the pairing rename has to happen before it, not after.
      {
        args: [
          'scripts/repo/post-build/pair-declarations-with-js.mts',
          ...fixArgs,
        ],
        command: 'node',
      },
      {
        args: ['scripts/fleet/gen/package-exports.mts', ...fixArgs],
        command: 'node',
      },
      {
        args: [
          'scripts/repo/post-build/rewrite-external-imports.mts',
          ...fixArgs,
        ],
        command: 'node',
      },
      {
        args: ['scripts/repo/post-build/rewrite-cjs-exports.mts', ...fixArgs],
        command: 'node',
      },
      {
        args: ['scripts/repo/post-build/apply-unexposed-stubs.mts', ...fixArgs],
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
        args: ['scripts/repo/validate/external-exports.mts', ...fixArgs],
        command: 'node',
      },
      {
        args: ['scripts/repo/validate/external-esm-cjs.mts', ...fixArgs],
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
  } catch (e) {
    logger.error(`Build fixing failed: ${errorMessage(e)}`)
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'orchestrates the post-build dist-shaping steps: exports rewrite, external imports, stubs, validators',
  help: `Usage: node scripts/repo/post-build.mts [flags]

  --verbose           show detailed output from each step
  --quiet, --silent   suppress progress messages`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
