/**
 * @fileoverview JavaScript compilation using esbuild (10x faster than tsgo)
 * This replaces tsgo for JS compilation while keeping tsgo for declarations
 */

import process from 'node:process'

import { build, context } from 'esbuild'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'

import {
  analyzeMetafile,
  buildConfig,
  watchConfig,
} from '../../.config/esbuild.config.mts'

const logger = getDefaultLogger()

const isQuiet = process.argv.includes('--quiet')
const isVerbose = process.argv.includes('--verbose')
const isWatch = process.argv.includes('--watch')

/**
 * Standard build for production
 */
async function buildJS(): Promise<number> {
  try {
    if (!isQuiet) {
      logger.step('Building JavaScript with esbuild')
    }

    const startTime = Date.now()
    const result = await build({
      ...buildConfig,
      logLevel: isQuiet ? 'silent' : isVerbose ? 'debug' : 'info',
    })

    const buildTime = Date.now() - startTime

    if (!isQuiet) {
      logger.log(`  JavaScript built in ${buildTime}ms`)

      if (result?.metafile && isVerbose) {
        const analysis = analyzeMetafile(result.metafile)
        logger.log(`  Total size: ${analysis.totalSize}`)
      }
    }

    return 0
  } catch (error) {
    if (!isQuiet) {
      logger.error('JavaScript build failed')
      logger.error(error)
    }
    return 1
  }
}

/**
 * Watch mode with incremental builds (68% faster rebuilds)
 */
async function watchJS(): Promise<number> {
  try {
    if (!isQuiet) {
      logger.step('Starting watch mode with incremental builds')
      logger.log('  Watching for file changes...')
    }

    const ctx = await context({
      ...watchConfig,
      logLevel: isQuiet ? 'silent' : isVerbose ? 'debug' : 'warning',
      plugins: [
        ...(watchConfig.plugins || []),
        {
          name: 'rebuild-logger',
          setup(build) {
            build.onEnd(result => {
              if (result.errors.length > 0) {
                if (!isQuiet) {
                  logger.error('Rebuild failed')
                }
              } else {
                if (!isQuiet) {
                  logger.success('Rebuild succeeded')

                  if (result?.metafile && isVerbose) {
                    const analysis = analyzeMetafile(result.metafile)
                    logger.log(`  Total size: ${analysis.totalSize}`)
                  }
                }
              }
            })
          },
        },
      ],
    })

    await ctx.watch()

    // On Ctrl-C, tear down the esbuild context and exit cleanly. Earlier
    // this handler threw inside an async callback, which surfaced as an
    // unhandled rejection and the outer try/catch rewrote the clean exit
    // into "Watch mode failed: Watch mode interrupted".
    process.on('SIGINT', () => {
      if (!isQuiet) {
        logger.log('\nStopping watch mode...')
      }
      ctx.dispose().finally(() => process.exit(0))
    })

    // Wait indefinitely — SIGINT is the only exit path.
    await new Promise<never>(() => {})
  } catch (error) {
    if (!isQuiet) {
      logger.error('Watch mode failed')
      logger.error(error)
    }
    return 1
  }
}

// Main
if (isWatch) {
  watchJS().catch(error => {
    logger.error(error)
    process.exitCode = 1
  })
} else {
  buildJS()
    .then(code => {
      process.exitCode = code
    })
    .catch(error => {
      logger.error(error)
      process.exitCode = 1
    })
}
