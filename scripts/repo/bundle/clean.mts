/**
 * @file Unified clean runner with flag-based configuration. Removes build
 *   artifacts, caches, and other generated files.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { deleteAsync } from 'del'
import fastGlob from 'fast-glob'

import { isQuiet } from '@socketsecurity/lib-stable/argv/flag-predicates'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { parseArgs } from '../../fleet/util/parse-args.mts'

import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const logger = getDefaultLogger()

const rootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
)

/**
 * Clean specific directories.
 */
interface CleanTask {
  name: string
  pattern?: string | undefined
  patterns?: string[] | undefined
}

export async function cleanDirectories(
  tasks: CleanTask[],
  options: { quiet?: boolean | undefined } = {},
): Promise<number> {
  const { quiet = false } = options

  for (let i = 0, { length } = tasks; i < length; i += 1) {
    const task = tasks[i]!
    const { name, pattern, patterns } = task
    const patternsToDelete = patterns || [pattern]

    if (!quiet) {
      logger.progress(`Cleaning ${name}`)
    }

    try {
      // Find all files/dirs matching the patterns
      const files = await fastGlob(patternsToDelete, {
        cwd: rootPath,
        absolute: true,
        dot: true,
        onlyFiles: false,
        markDirectories: true,
      })

      // Delete each file/directory
      await deleteAsync(files)

      if (!quiet) {
        if (files.length > 0) {
          logger.done(`Cleaned ${name} (${files.length} items)`)
        } else {
          logger.done(`Cleaned ${name} (already clean)`)
        }
      }
    } catch (error) {
      if (!quiet) {
        logger.error(`Failed to clean ${name}`)
        logger.error(error.message)
      }
      return 1
    }
  }

  return 0
}

async function main(): Promise<void> {
  try {
    // Parse arguments
    const { values } = parseArgs({
      options: {
        all: {
          type: 'boolean',
          default: false,
        },
        cache: {
          type: 'boolean',
          default: false,
        },
        coverage: {
          type: 'boolean',
          default: false,
        },
        dist: {
          type: 'boolean',
          default: false,
        },
        types: {
          type: 'boolean',
          default: false,
        },
        modules: {
          type: 'boolean',
          default: false,
        },
        quiet: {
          type: 'boolean',
          default: false,
        },
        silent: {
          type: 'boolean',
          default: false,
        },
      },
      allowPositionals: false,
      strict: false,
    })

    const quiet = isQuiet(values)

    // Determine what to clean
    const cleanAll =
      values.all ||
      (!values.cache &&
        !values.coverage &&
        !values.dist &&
        !values.types &&
        !values.modules)

    const tasks = []

    // Build task list
    if (cleanAll || values.cache) {
      tasks.push({ name: 'cache', pattern: '.cache' })
    }

    if (cleanAll || values.coverage) {
      tasks.push({ name: 'coverage', pattern: 'coverage' })
    }

    if (cleanAll || values.dist) {
      tasks.push({
        name: 'dist',
        patterns: ['dist', '*.tsbuildinfo', '.tsbuildinfo'],
      })
    } else if (values.types) {
      tasks.push({ name: 'dist/types', patterns: ['dist/types'] })
    }

    if (values.modules) {
      tasks.push({ name: 'node_modules', pattern: '**/node_modules' })
    }

    // Check if there's anything to clean
    if (tasks.length === 0) {
      if (!quiet) {
        logger.info('Nothing to clean')
      }
      process.exitCode = 0
      return
    }

    if (!quiet) {
      printHeader('Clean Runner')
      logger.step('Cleaning project directories')
    }

    // Clean directories
    const exitCode = await cleanDirectories(tasks, { quiet })

    if (exitCode !== 0) {
      if (!quiet) {
        logger.error('Clean failed')
      }
      process.exitCode = exitCode
    } else {
      if (!quiet) {
        logger.success('Clean completed successfully!')
      }
    }
  } catch (error) {
    logger.error(`Clean runner failed: ${error.message}`)
    process.exitCode = 1
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'unified clean runner — removes build artifacts, caches, and other generated files',
  help: `Usage: node scripts/repo/bundle/clean.mts [flags]

  --all               clean everything (default if no flags)
  --cache             clean cache directories
  --coverage          clean coverage reports
  --dist              clean build output
  --types             clean TypeScript declarations only
  --modules           clean node_modules
  --quiet, --silent   suppress progress messages`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
