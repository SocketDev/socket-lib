/**
 * @fileoverview Check script for the lib.
 * Runs all quality checks in parallel:
 * - Linting (via lint command)
 * - TypeScript type checking
 *
 * Usage:
 *   node scripts/check.mts [options]
 *
 * Options:
 *   --all      Run on all files (default behavior)
 *   --staged   Run on staged files only
 */

import process from 'node:process'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'
import { printFooter } from '@socketsecurity/lib-stable/stdio/footer'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { runCommandQuiet, runParallel } from './utils/run-command.mts'

const logger = getDefaultLogger()

async function runTypeCheck(quiet = false): Promise<number> {
  if (!quiet) {
    logger.progress('Checking TypeScript')
  }
  const result = await runCommandQuiet('tsgo', ['--noEmit'])
  if (result.exitCode !== 0) {
    if (!quiet) {
      logger.error('Type checks failed')
    }
    if (result.stdout) {
      console.log(result.stdout)
    }
    return result.exitCode
  }
  if (!quiet) {
    logger.clearLine().done('Type checks passed')
  }
  return 0
}

async function main(): Promise<void> {
  try {
    const all = process.argv.includes('--all')
    const quiet = process.argv.includes('--quiet')
    const staged = process.argv.includes('--staged')
    const help = process.argv.includes('--help') || process.argv.includes('-h')

    if (help) {
      logger.log('Check Runner')
      logger.log('\nUsage: node scripts/check.mts [options]')
      logger.log('\nOptions:')
      logger.log('  --help, -h     Show this help message')
      logger.log('  --all          Run on all files (default behavior)')
      logger.log('  --staged       Run on staged files only')
      logger.log('\nExamples:')
      logger.log('  node scripts/check.mts          # Run on all files')
      logger.log(
        '  node scripts/check.mts --all    # Run on all files (explicit)',
      )
      logger.log('  node scripts/check.mts --staged # Run on staged files')
      process.exitCode = 0
      return
    }

    printHeader('Code Checks')

    const checks = []

    // Delegate to lint command with appropriate flags
    const lintArgs = ['run', 'lint']
    if (all) {
      lintArgs.push('--all')
    } else if (staged) {
      lintArgs.push('--staged')
    }

    checks.push({
      args: lintArgs,
      command: 'pnpm',
      options: {
        ...(process.platform === 'win32' && { shell: true }),
      },
    })

    checks.push(
      {
        args: ['scripts/validate/no-link-deps.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/no-extraneous-dependencies.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/esbuild-minify.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/no-cdn-refs.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/markdown-filenames.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/file-size.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      {
        args: ['scripts/validate/file-count.mts'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
      // Path-hygiene gate (1 path, 1 reference). See
      // .claude/skills/path-guard/ + .claude/hooks/path-guard/.
      {
        args: ['scripts/check-paths.mts', '--quiet'],
        command: 'node',
        options: {
          ...(process.platform === 'win32' && { shell: true }),
        },
      },
    )

    const exitCodes = await runParallel(checks)
    const failed = exitCodes.some(code => code !== 0)

    if (failed) {
      logger.error('Some checks failed')
      process.exitCode = 1
      return
    }

    const typeCheckExitCode = await runTypeCheck(quiet)
    if (typeCheckExitCode !== 0) {
      process.exitCode = typeCheckExitCode
      return
    }

    logger.success('All checks passed')
    printFooter()
  } catch (e) {
    logger.error(`Check failed: ${e.message}`)
    process.exitCode = 1
  }
}

main().catch((e: unknown) => {
  logger.error(e)
  process.exitCode = 1
})
