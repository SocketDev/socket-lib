/**
 * @fileoverview JavaScript compilation using esbuild (10x faster than tsgo)
 * This replaces tsgo for JS compilation while keeping tsgo for declarations
 */

import { build, context } from 'esbuild'

import {
  analyzeMetafile,
  buildConfig,
  watchConfig,
} from '../../.config/esbuild.config.mjs'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'

const logger = getDefaultLogger()

const isQuiet = process.argv.includes('--quiet')
const isVerbose = process.argv.includes('--verbose')
const isWatch = process.argv.includes('--watch')

/**
 * Standard build for production
 */
async function buildJS() {
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
async function watchJS() {
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

    // Keep process alive
    process.on('SIGINT', async () => {
      if (!isQuiet) {
        logger.log('\nStopping watch mode...')
      }
      await ctx.dispose()
      process.exitCode = 0
      throw new Error('Watch mode interrupted')
    })

    // Wait indefinitely
    await new Promise(() => {})
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
