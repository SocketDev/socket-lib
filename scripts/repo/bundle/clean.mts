/**
 * @file Unified clean runner with flag-based configuration. Removes build
 *   artifacts, caches, and other generated files.
 */

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { deleteAsync } from 'del'
import fastGlob from 'fast-glob'

import { isQuiet } from '../flags/predicates.mts'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { parseArgs } from '../../fleet/util/parse-args.mts'

import { isMainModule } from '../../fleet/process/is-main-module.mts'
import { runMain } from '../../fleet/process/run-main.mts'

import type { ScriptMeta } from '../../fleet/process/run-main.mts'

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
export interface CleanTask {
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
    // A task carries either `patterns` or a single `pattern`, both optional on
    // CleanTask, so `[pattern]` alone is a (string | undefined)[] that fast-glob
    // will not take. Drop the hole rather than widen fast-glob's input.
    const patternsToDelete = patterns ?? (pattern ? [pattern] : [])
    if (!patternsToDelete.length) {
      continue
    }

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
    } catch (e) {
      if (!quiet) {
        logger.error(`Failed to clean ${name}`)
        logger.error(errorMessage(e))
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

    // `strict: false` leaves `values` with an index signature of `unknown`, so
    // coerce once instead of bracket-reading a possibly-unknown flag at each
    // of the eleven use sites below.
    const flags = {
      all: Boolean(values['all']),
      cache: Boolean(values['cache']),
      coverage: Boolean(values['coverage']),
      dist: Boolean(values['dist']),
      modules: Boolean(values['modules']),
      types: Boolean(values['types']),
    }

    // Determine what to clean
    const cleanAll =
      flags.all ||
      (!flags.cache &&
        !flags.coverage &&
        !flags.dist &&
        !flags.types &&
        !flags.modules)

    const tasks = []

    // Build task list
    if (cleanAll || flags.cache) {
      tasks.push({ name: 'cache', pattern: '.cache' })
    }

    if (cleanAll || flags.coverage) {
      tasks.push({ name: 'coverage', pattern: 'coverage' })
    }

    if (cleanAll || flags.dist) {
      tasks.push({
        name: 'dist',
        patterns: ['dist', '*.tsbuildinfo', '.tsbuildinfo'],
      })
    } else if (flags.types) {
      tasks.push({ name: 'dist/types', patterns: ['dist/types'] })
    }

    if (flags.modules) {
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
  } catch (e) {
    logger.error(`Clean runner failed: ${errorMessage(e)}`)
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
