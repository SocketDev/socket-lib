/**
 * @file Build runner: rolldown for the per-file source + externals builds, tsgo
 *   for declarations.
 */

import { existsSync, promises as fsPromises } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { rolldown, watch } from 'rolldown'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { WIN32 } from '@socketsecurity/lib-stable/constants/platform'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printFooter } from '@socketsecurity/lib-stable/stdio/footer'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { buildConfig } from '../../.config/rolldown.config.mts'
import { primBuildConfig } from '../../.config/repo/rolldown.prim.config.mts'
import { parseArgs } from '../fleet/util/parse-args.mts'
import { runSequence } from '../fleet/util/run-command.mts'
import { verifyDist } from './verify-dist.mts'

const logger = getDefaultLogger()

const rootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

/**
 * MacOS-only fsync barrier: walk `dist/` and `fsync()` every regular file so
 * downstream steps (tests, packagers) see fully-durable bytes rather than
 * page-cache state. esbuild + child-process builders resolve their write
 * Promises before the file system view is durable on darwin CI runners.
 *
 * Skipped on Linux + Windows: Linux's `fs.writeFile` already provides the
 * needed durability for our use, and Windows cannot `open(dir, 'r')` for the
 * directory-flush step (different file-handle semantics).
 *
 * **Why:** Past incident — socket-lib v6.0.1 + v6.0.2 macOS CI flakes where
 * `Build completed successfully` logged with 502 validated exports, then the
 * very next vitest run hit `Unexpected token '{'` on a `dist/external/*.js`
 * shim and `Cannot find module 'dist/packages/normalize.js'`. Files written but
 * not yet durable.
 */
async function fsyncDirRecursive(dir: string): Promise<void> {
  if (process.platform !== 'darwin') {
    return
  }
  const entries = await fsPromises.readdir(dir, { withFileTypes: true })
  const filePromises: Array<Promise<void>> = []
  const subdirs: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      subdirs.push(entryPath)
    } else if (entry.isFile()) {
      filePromises.push(fsyncFile(entryPath))
    }
  }
  await Promise.all(filePromises)
  // Subdirs in parallel to keep the barrier cheap on wide trees.
  await Promise.all(subdirs.map(fsyncDirRecursive))
}

async function fsyncFile(filePath: string): Promise<void> {
  // Best-effort — a single failed fsync shouldn't tank the build. Macs
  // occasionally surface EPERM on system-restored files; the bytes are
  // already on disk, just unflushable from userspace.
  try {
    const fh = await fsPromises.open(filePath, 'r')
    try {
      await fh.sync()
    } finally {
      await fh.close()
    }
  } catch {
    // ignore — best-effort barrier
  }
}

/**
 * Build source code with rolldown. Returns { exitCode, buildTime } for external
 * logging.
 */
interface BuildSourceOptions {
  quiet?: boolean | undefined
  skipClean?: boolean | undefined
  verbose?: boolean | undefined
  analyze?: boolean | undefined
}

interface BuildSourceResult {
  exitCode: number
  buildTime: number
}

export async function buildSource(
  options: BuildSourceOptions = {},
): Promise<BuildSourceResult> {
  const { quiet = false, skipClean = false } = options

  // Clean dist directory if needed
  if (!skipClean) {
    const exitCode = await runSequence([
      {
        args: ['scripts/build/clean.mts', '--dist', '--quiet'],
        command: 'node',
      },
    ])
    if (exitCode !== 0) {
      if (!quiet) {
        logger.error('Clean failed')
      }
      return { exitCode, buildTime: 0 }
    }
  }

  try {
    const startTime = Date.now()
    const { output, ...inputOptions } = buildConfig
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(output)
    } finally {
      await bundle.close()
    }
    const buildTime = Date.now() - startTime

    return { exitCode: 0, buildTime }
  } catch (error) {
    if (!quiet) {
      logger.error('Source build failed')
      logger.error(error)
    }
    return { exitCode: 1, buildTime: 0 }
  }
}

/**
 * Build TypeScript declarations. Returns exitCode for external logging.
 */
interface BuildTypesOptions {
  quiet?: boolean | undefined
  skipClean?: boolean | undefined
  verbose?: boolean | undefined
}

export async function buildTypes(
  options: BuildTypesOptions = {},
): Promise<number> {
  const {
    quiet = false,
    skipClean = false,
    verbose: _verbose = false,
  } = options

  const commands = []

  if (!skipClean) {
    commands.push({
      args: ['scripts/build/clean.mts', '--types', '--quiet'],
      command: 'node',
    })
  }

  commands.push({
    args: ['exec', 'tsgo', '--project', 'tsconfig.dts.json'],
    command: 'pnpm',
    options: {
      shell: WIN32,
    },
  })

  const exitCode = await runSequence(commands)

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('Type declarations build failed')
    }
  }

  return exitCode
}

/**
 * Build the prim CLI: a true bundle (not per-file transpile) that inlines
 * lib-stable + diff + the acorn-wasm wrapper into a single `dist/bin/prim.cjs`.
 * The vendored `acorn-bindgen.cjs` + `acorn.wasm` are copied alongside so the
 * bindgen's `${__dirname}/./acorn.wasm` sibling-load resolves after publish.
 */
export async function buildPrim(
  options: { quiet?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false } = options
  try {
    const { output, ...inputOptions } = primBuildConfig
    const bundle = await rolldown(inputOptions)
    try {
      await bundle.write(output)
    } finally {
      await bundle.close()
    }
    // Stage vendored wasm + bindgen next to the bundle. The bindgen
    // uses `${__dirname}/./acorn.wasm`, so they must be siblings of
    // `dist/bin/prim.cjs` at runtime.
    const binDir = path.join(rootPath, 'dist/bin')
    await fsPromises.mkdir(binDir, { recursive: true })
    const vendor = path.join(rootPath, 'vendor/acorn')
    await fsPromises.copyFile(
      path.join(vendor, 'acorn-bindgen.cjs'),
      path.join(binDir, 'acorn-bindgen.cjs'),
    )
    await fsPromises.copyFile(
      path.join(vendor, 'acorn.wasm'),
      path.join(binDir, 'acorn.wasm'),
    )
    // Make the bin executable so `pnpm exec prim` / direct invocation
    // works without `node` prefix.
    await fsPromises.chmod(path.join(binDir, 'prim.cjs'), 0o755)
    return 0
  } catch (error) {
    if (!quiet) {
      logger.error('prim bundle build failed')
      logger.error(error)
    }
    return 1
  }
}

/**
 * Build external dependencies. Returns exitCode for external logging.
 */
export async function buildExternals(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false, verbose = false } = options

  const args = ['scripts/build/externals.mts']
  if (quiet) {
    args.push('--quiet')
  }
  if (verbose) {
    args.push('--verbose')
  }

  const exitCode = await runSequence([
    {
      args,
      command: 'node',
    },
  ])

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('External dependencies build failed')
    }
  }

  return exitCode
}

/**
 * Run the post-build dist-shaping steps (scripts/post-build.mts). Returns
 * exitCode for external logging.
 */
export async function runPostBuild(
  options: { quiet?: boolean | undefined; verbose?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false, verbose = false } = options

  const postBuildArgs = ['scripts/post-build.mts']
  if (quiet) {
    postBuildArgs.push('--quiet')
  }
  if (verbose) {
    postBuildArgs.push('--verbose')
  }

  const exitCode = await runSequence([
    {
      args: postBuildArgs,
      command: 'node',
    },
  ])

  if (exitCode !== 0) {
    if (!quiet) {
      logger.error('Post-build failed')
    }
  }

  return exitCode
}

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
 * Check if build is needed.
 */
export function isBuildNeeded(): boolean {
  const distPath = path.join(rootPath, 'dist', 'index.js')
  const distTypesPath = path.join(rootPath, 'dist', 'types', 'index.d.ts')

  return !existsSync(distPath) || !existsSync(distTypesPath)
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

    // Check if build is needed
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
      const validateArgs = ['scripts/validate/external-types.mts']
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
          args: ['scripts/build/clean.mts', '--dist', '--types', '--quiet'],
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
        // Fsync barrier — see `fsyncDirRecursive` docstring. Runs between the
        // parallel builders and downstream phases (runPostBuild, then tests)
        // so no consumer reads stale page-cache state.
        const distDir = path.join(rootPath, 'dist')
        if (existsSync(distDir)) {
          await fsyncDirRecursive(distDir)
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
