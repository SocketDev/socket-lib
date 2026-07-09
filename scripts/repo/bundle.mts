/**
 * @file Bundle runner (the `build` script): rolldown for the per-file source +
 *   externals builds, tsgo for declarations. Step scripts live in
 *   scripts/repo/bundle/ (clean, externals, verify-dist).
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { watch } from 'rolldown'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printFooter } from '@socketsecurity/lib-stable/stdio/footer'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { buildConfig } from '../../.config/rolldown.config.mts'
// Repo root from the canonical paths module (1 path, 1 reference).
import { REPO_ROOT as rootPath } from '../fleet/paths.mts'
import { parseArgs } from '../fleet/util/parse-args.mts'
import { runSequence } from '../fleet/util/run-command.mts'
import { fsyncDist } from './bundle/fsync-dist.mts'
import {
  buildExternals,
  buildPrim,
  buildSource,
  buildTypes,
  runPostBuild,
} from './bundle/steps.mts'
import { verifyDist } from './bundle/verify-dist.mts'

const logger = getDefaultLogger()

/**
 * Build source code with rolldown. Returns { exitCode, buildTime } for external
 * logging.
 */
/**
 * Watch mode for development with incremental builds (68% faster rebuilds).
 */
export async function watchBuild(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false } = options

  if (!quiet) {
    logger.step('Starting watch mode with incremental builds')
    logger.substep('Watching for file changes…')
  }

  try {
    const { output, ...inputOptions } = buildConfig
    const watcher = watch({ ...inputOptions, output })

    // rolldown requires closing each build's result on BUNDLE_END to avoid
    // leaking native handles; ERROR surfaces a failed rebuild.
    watcher.on('event', event => {
      if (event.code === 'BUNDLE_END') {
        if (!quiet) {
          logger.success('Rebuild succeeded')
        }
        event.result.close()
      } else if (event.code === 'ERROR') {
        if (!quiet) {
          logger.error('Rebuild failed')
          logger.error(event.error)
        }
      }
    })

    // On Ctrl-C, close the watcher and exit cleanly. A throw inside an async
    // callback would surface as an unhandled rejection and get rewritten by
    // the surrounding catch into a misleading "Watch mode failed".
    process.on('SIGINT', () => {
      watcher.close().finally(() => process.exit(0))
    })

    // Wait indefinitely — SIGINT is the only exit path.
    await new Promise<never>(() => {})
    // Unreachable; satisfies Promise<number> return type.
    return 0
  } catch (error) {
    if (!quiet) {
      logger.error('Watch mode failed:', error)
    }
    return 1
  }
}

/**
 * Whether `--needed` should run a build — true when dist artifacts are absent.
 *
 * The old check looked for `dist/index.js` + `dist/types/index.d.ts`, but this
 * package has NO root entry (no `main`/`exports["."]`) and declarations emit
 * co-located in `dist/` (not `dist/types/`). Both paths never existed, so
 * isBuildNeeded() ALWAYS returned true → `prepare`/`--needed` rebuilt on every
 * `pnpm install` — a primary cause of the install slowdown. Instead, derive the
 * sentinel from the `package.json` exports' `default` (.js) + `types` (.d.ts)
 * dist targets, so the check tracks the actual output layout and can't drift
 * wrong again.
 *
 * Checks EVERY dist-backed target, not just the first export's: a single
 * sentinel let `--needed` skip the rebuild whenever the FIRST export's files
 * existed, so adding a NEW export (e.g. external-tools/python) left its dist
 * output unbuilt — `pnpm install --needed` saw the first sentinel, returned
 * false, and CI's public-files-are-exported check then flagged the new export
 * as stale. Requiring all targets to exist makes a newly-added export force a
 * rebuild.
 */
export function isBuildNeeded(): boolean {
  let pkg: {
    exports?: Record<string, unknown> | undefined
  }
  try {
    pkg = JSON.parse(
      readFileSync(path.join(rootPath, 'package.json'), 'utf8'),
    ) as typeof pkg
  } catch {
    // Can't read the manifest — fail safe by building.
    return true
  }
  const exportsMap = pkg.exports ?? {}
  const exportValues = Object.values(exportsMap)
  for (let i = 0, { length } = exportValues; i < length; i += 1) {
    const value = exportValues[i]!
    if (!value || typeof value !== 'object') {
      continue
    }
    const entry = value as {
      default?: unknown | undefined
      types?: unknown | undefined
    }
    const targets = [entry.default, entry.types].filter(
      (t): t is string => typeof t === 'string' && t.startsWith('./dist/'),
    )
    // Every dist-backed target must exist. A missing one (a fresh export, a
    // cleaned dir) means the build is needed — don't stop at the first export.
    for (
      let j = 0, { length: targetsLength } = targets;
      j < targetsLength;
      j += 1
    ) {
      if (!existsSync(path.join(rootPath, targets[j]!))) {
        return true
      }
    }
  }
  // Either every dist-backed export target exists (built), or there are no
  // dist-backed exports (nothing to build). Both mean: no build needed.
  return false
}

async function main(): Promise<void> {
  try {
    // Parse arguments
    const { values } = parseArgs({
      options: {
        help: {
          type: 'boolean',
          default: false,
        },
        src: {
          type: 'boolean',
          default: false,
        },
        types: {
          type: 'boolean',
          default: false,
        },
        watch: {
          type: 'boolean',
          default: false,
        },
        needed: {
          type: 'boolean',
          default: false,
        },
        analyze: {
          type: 'boolean',
          default: false,
        },
        silent: {
          type: 'boolean',
          default: false,
        },
        quiet: {
          type: 'boolean',
          default: false,
        },
        verbose: {
          type: 'boolean',
          default: false,
        },
      },
      allowPositionals: false,
      strict: false,
    })

    // Show help if requested
    if (values.help) {
      logger.log('Build Runner')
      logger.log('')
      logger.log('Usage: pnpm build [options]')
      logger.log('')
      logger.log('Options:')
      logger.log('  --help       Show this help message')
      logger.log('  --src        Build source code only')
      logger.log('  --types      Build TypeScript declarations only')
      logger.log(
        '  --watch      Watch mode with incremental builds (68% faster rebuilds)',
      )
      logger.log('  --needed     Only build if dist files are missing')
      logger.log('  --analyze    Show bundle size analysis')
      logger.log('  --quiet, --silent  Suppress progress messages')
      logger.log('  --verbose    Show detailed build output')
      logger.log('')
      logger.log('Examples:')
      logger.log('  pnpm build              # Full build (source + types)')
      logger.log('  pnpm build --src        # Build source only')
      logger.log('  pnpm build --types      # Build types only')
      logger.log(
        '  pnpm build --watch      # Watch mode with incremental builds',
      )
      logger.log('  pnpm build --analyze    # Build with size analysis')
      logger.log('')
      logger.log('Note: Watch mode uses rolldown for incremental rebuilds')
      process.exitCode = 0
      return
    }

    const quiet = isQuiet(values)
    const verbose = values.verbose

    // `--needed` is the `prepare`/install path. In CI, skip it entirely: CI
    // runs explicit build/test/check steps, so the install-time `prepare`
    // build is redundant work that only adds latency to every `pnpm install`
    // in the pipeline. (Locally, `--needed` still builds when dist is absent.)
    if (values.needed && process.env['CI'] === 'true') {
      if (!quiet) {
        logger.info(
          'CI detected — skipping prepare-time build (CI builds explicitly)',
        )
      }
      process.exitCode = 0
      return
    }

    // Check if build is needed. isBuildNeeded() short-circuits when dist
    // artifacts already exist, so a local `pnpm install` with a built dist/
    // is near-instant instead of rebuilding every time.
    if (values.needed && !isBuildNeeded()) {
      if (!quiet) {
        logger.info('Build artifacts exist, skipping build')
      }
      process.exitCode = 0
      return
    }

    let exitCode = 0

    // Handle watch mode
    if (values.watch) {
      if (!quiet) {
        printHeader('Build Runner (Watch Mode)')
      }
      exitCode = await watchBuild({ quiet, verbose })
    }
    // Build types only
    else if (values.types && !values.src) {
      if (!quiet) {
        printHeader('Building TypeScript Declarations')
      }
      exitCode = await buildTypes({ quiet, verbose })
      if (exitCode === 0 && !quiet) {
        logger.substep('Type declarations built')
      }
    }
    // Build source only
    else if (values.src && !values.types) {
      if (!quiet) {
        printHeader('Building Source')
      }
      const { buildTime, exitCode: srcExitCode } = await buildSource({
        quiet,
        verbose,
        analyze: values.analyze,
      })
      exitCode = srcExitCode
      if (exitCode === 0 && !quiet) {
        logger.substep(`Source build complete in ${buildTime}ms`)
      }
    }
    // Build everything (default)
    else {
      if (!quiet) {
        printHeader('Building Package')
      }

      // Validate external type definitions before building
      const validateArgs = ['scripts/repo/validate/external-types.mts']
      if (quiet) {
        validateArgs.push('--quiet')
      }
      if (verbose) {
        validateArgs.push('--verbose')
      }

      const validateExitCode = await runSequence([
        {
          args: validateArgs,
          command: 'node',
        },
      ])

      // Only warn on validation failure, don't block build
      // (some external modules may still use export = for now)
      if (validateExitCode !== 0 && verbose && !quiet) {
        logger.warn('Some external type definitions use legacy patterns')
        logger.substep(
          'Build will continue, but consider migrating to ES6 exports',
        )
      }

      exitCode = await runSequence([
        {
          args: [
            'scripts/repo/bundle/clean.mts',
            '--dist',
            '--types',
            '--quiet',
          ],
          command: 'node',
        },
      ])
      if (exitCode !== 0) {
        if (!quiet) {
          logger.error('Clean failed')
        }
        process.exitCode = exitCode
        return
      }

      if (!quiet) {
        logger.success('Build Cleaned')
      }

      // Run source, externals, and types builds in parallel. Use
      // `allSettled` so a rejection in one builder doesn't short-
      // circuit the others mid-write — past CI flakiness on a SHIP
      // had buildExternals finish + log "Build completed successfully"
      // while buildSource/buildTypes were still writing files, then
      // the test runner started before those writes flushed.
      const settled = await Promise.allSettled([
        buildSource({
          quiet,
          verbose,
          skipClean: true,
          analyze: values.analyze,
        }),
        buildExternals({ quiet, verbose }),
        buildTypes({ quiet, verbose, skipClean: true }),
        buildPrim({ quiet }),
      ])
      const [srcSettled, externalsSettled, typesSettled, primSettled] = settled
      const srcResult: BuildSourceResult =
        srcSettled.status === 'fulfilled'
          ? srcSettled.value
          : (logger.error(`buildSource rejected: ${srcSettled.reason}`),
            { exitCode: 1, buildTime: 0 })
      const externalsExitCode: number =
        externalsSettled.status === 'fulfilled'
          ? externalsSettled.value
          : (logger.error(
              `buildExternals rejected: ${externalsSettled.reason}`,
            ),
            1)
      const typesExitCode: number =
        typesSettled.status === 'fulfilled'
          ? typesSettled.value
          : (logger.error(`buildTypes rejected: ${typesSettled.reason}`), 1)
      const primExitCode: number =
        primSettled.status === 'fulfilled'
          ? primSettled.value
          : (logger.error(`buildPrim rejected: ${primSettled.reason}`), 1)

      // Check if any of the parallel builds failed
      exitCode =
        srcResult.exitCode !== 0
          ? srcResult.exitCode
          : externalsExitCode !== 0
            ? externalsExitCode
            : typesExitCode !== 0
              ? typesExitCode
              : primExitCode

      // If all parallel builds succeeded, flush dist/ to disk and run the
      // post-build dist-shaping steps.
      if (exitCode === 0) {
        // Fsync barrier — see `fsync-dist.mts`. Runs between the parallel
        // builders and downstream phases (runPostBuild, then tests) so no
        // consumer reads stale page-cache state.
        const distDir = path.join(rootPath, 'dist')
        if (existsSync(distDir)) {
          await fsyncDist(distDir)
        }
        const postBuildExitCode = await runPostBuild({ quiet, verbose })
        exitCode = postBuildExitCode
        // Integrity guard: syntax-check the emitted JS so a corrupt /
        // half-written file (parallel-write race) fails the build here
        // rather than as a cryptic SyntaxError at test time.
        if (exitCode === 0 && existsSync(distDir)) {
          exitCode = await verifyDist(distDir)
        }
      }
    }

    // Print final status and footer
    if (!quiet) {
      if (exitCode === 0) {
        logger.success('Build completed successfully!')
      } else {
        logger.error('Build failed')
      }
      printFooter()
    }

    if (exitCode !== 0) {
      process.exitCode = exitCode
    }
  } catch (error) {
    logger.error(`Build runner failed: ${error.message}`)
    process.exitCode = 1
  }
}

main().catch(error => {
  logger.error(error.message || error)
  process.exitCode = 1
})
