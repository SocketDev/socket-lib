/**
 * @file Run tests with coverage reporting across both the main + isolated
 *   vitest suites, merge coverage-final.json via max-hit-count, and gate the
 *   aggregate against thresholds declared in
 *   .config/vitest.coverage.config.mts. Sets COVERAGE=true so vitest config
 *   enables source resolution. Flags: --code-only Skip type-coverage (only run
 *   vitest) --type-only Skip vitest (only run type-coverage) --summary Hide
 *   detailed coverage table, show summary only --update-readme After a
 *   successful run, rewrite the coverage badge in README.md to the aggregate
 *   statements percentage.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '@socketsecurity/lib-stable/argv/parse'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { printHeader } from '@socketsecurity/lib-stable/stdio/header'

import { aggregateCoverageThresholds } from '../../.config/vitest.coverage.config.mts'
import { runCommandQuiet } from '../fleet/util/run-command.mts'
import { mergeCoverageFinal } from './cover-merge.mts'

import type { AggregateCoverage } from './cover-merge.mts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.resolve(__dirname, '../..')

const logger = getDefaultLogger()

const WIN32 = process.platform === 'win32'

const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

export interface SuiteResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface TestSuitesResult {
  combined: SuiteResult
  isolatedResult: SuiteResult
  mainResult: SuiteResult
}

/**
 * Strip ANSI codes and decorative characters from text.
 */
export function cleanOutput(text: string): string {
  return text
    .replace(ansiRegex, '')
    .replace(/(?:⚡|✧|︎)\s*/g, '')
    .trim()
}

/**
 * Parse type-coverage output to extract percentage.
 */
export function parseTypeCoveragePercent(output: string): number | undefined {
  const match = output.match(/\([\d\s/]+\)\s+([\d.]+)%/)
  return match?.[1] ? Number.parseFloat(match[1]) : undefined
}

/**
 * Run both main and isolated vitest suites, returning per-suite + combined
 * results.
 */
export async function runTestSuites(
  mainArgs: string[],
  isolatedArgs: string[],
): Promise<TestSuitesResult> {
  const run = async (args: string[]): Promise<SuiteResult> => {
    try {
      return await runCommandQuiet('pnpm', args, {
        cwd: rootPath,
        env: { ...process.env, COVERAGE: 'true' },
      })
    } catch (e) {
      const err = e as Record<string, unknown>
      return {
        exitCode: 1,
        stdout: (err['stdout'] as string) || '',
        stderr: (err['stderr'] as string) || (err['message'] as string) || '',
      }
    }
  }

  const mainResult = await run(mainArgs)
  const isolatedResult = await run(isolatedArgs)

  const exitCode =
    mainResult.exitCode !== 0 ? mainResult.exitCode : isolatedResult.exitCode

  const combined: SuiteResult = {
    exitCode,
    stderr: mainResult.stderr + isolatedResult.stderr,
    stdout: mainResult.stdout + isolatedResult.stdout,
  }

  return { combined, isolatedResult, mainResult }
}

/**
 * Display code coverage results including test summary, v8 report, and
 * aggregate metrics.
 */
export function displayCodeCoverage(
  mainOutput: string,
  combinedOutput: string,
  aggregateCoverage: AggregateCoverage | undefined,
  {
    showDetail,
    typeCoveragePercent,
  }: { showDetail: boolean; typeCoveragePercent: number | undefined },
): void {
  if (showDetail) {
    const testSummaryMatch = combinedOutput.match(
      /Test Files\s+\d+[^\n]*\n[\s\S]*?Duration\s+[\d.]+m?s[^\n]*/,
    )
    if (testSummaryMatch) {
      logger.log('')
      logger.log(testSummaryMatch[0])
      logger.log('')
    }

    // Grab vitest's v8 coverage table header: the `% Coverage report from v8`
    // banner, then a separator row (group 1 = the `-|` rule), the header row
    // (group 2), and the same separator again via backreference `\1`.
    const coverageHeaderMatch = mainOutput.match(
      / % Coverage report from v8\n([-|]+)\n([^\n]+)\n\1/,
    )
    const allFilesMatch = mainOutput.match(
      /All files\s+\|\s+([\d.]+)\s+\|[^\n]*/,
    )
    if (coverageHeaderMatch && allFilesMatch) {
      logger.log(' % Coverage report from v8')
      logger.log(coverageHeaderMatch[1])
      logger.log(coverageHeaderMatch[2])
      logger.log(coverageHeaderMatch[1])
      logger.log(allFilesMatch[0])
      logger.log(coverageHeaderMatch[1])
      logger.log('')
    }
  }

  const codeCoveragePercent = aggregateCoverage
    ? Number.parseFloat(aggregateCoverage.statements)
    : (() => {
        const m = mainOutput.match(/All files\s+\|\s+([\d.]+)\s+\|/)
        return m?.[1] ? Number.parseFloat(m[1]) : 0
      })()

  logger.log(' Coverage Summary')
  logger.log(' ───────────────────────────────')

  if (typeCoveragePercent !== undefined) {
    logger.log(` Type Coverage: ${typeCoveragePercent.toFixed(2)}%`)
  }
  logger.log(` Code Coverage: ${codeCoveragePercent.toFixed(2)}%`)

  if (aggregateCoverage) {
    logger.log('')
    logger.log(' Aggregate Code Coverage (Main + Isolated):')
    logger.log(
      `   Statements: ${aggregateCoverage.statements}% | Branches: ${aggregateCoverage.branches}%`,
    )
    logger.log(
      `   Functions:  ${aggregateCoverage.functions}% | Lines:    ${aggregateCoverage.lines}%`,
    )
  }

  if (typeCoveragePercent !== undefined) {
    const cumulativePercent = (
      (codeCoveragePercent + typeCoveragePercent) /
      2
    ).toFixed(2)
    logger.log(' ───────────────────────────────')
    logger.log(` Cumulative:    ${cumulativePercent}%`)
  }

  logger.log('')
}

/**
 * Rewrite the coverage badge in README.md to the given percentage. The badge
 * shape matches the canonical fleet form:
 * ![Coverage](https://img.shields.io/badge/coverage-<PCT>%25-brightgreen) No-op
 * (and reports back) when no badge line matches — surfaces the drift rather
 * than silently doing nothing.
 */
export async function updateReadmeBadge(percent: number): Promise<boolean> {
  const readmePath = path.join(rootPath, 'README.md')
  let content: string
  try {
    content = await fs.readFile(readmePath, 'utf8')
  } catch (e) {
    logger.warn(`Failed to read ${readmePath}: ${errorMessage(e)}`)
    return false
  }
  // Match the README shields.io coverage badge so the percentage can be
  // swapped: group 1 = the markdown + URL prefix up to `coverage-`, group 2 =
  // the current percentage, group 3 = the `%25-<color>)` suffix.
  const badgeRegex =
    /(!\[Coverage\]\(https:\/\/img\.shields\.io\/badge\/coverage-)([\d.]+)(%25-[a-z]+\))/
  if (!badgeRegex.test(content)) {
    logger.warn(`No coverage badge found in ${readmePath} — leaving as-is`)
    return false
  }
  const pctStr = String(Math.floor(percent))
  const next = content.replace(badgeRegex, `$1${pctStr}$3`)
  if (next === content) {
    return false
  }
  await fs.writeFile(readmePath, next, 'utf8')
  return true
}

/**
 * Gate the aggregate against thresholds. Returns 0 if all thresholds met,
 * non-zero otherwise.
 */
export function gateAggregate(aggregate: AggregateCoverage): number {
  const checks: Array<[keyof AggregateCoverage, number]> = [
    ['statements', aggregateCoverageThresholds.statements],
    ['branches', aggregateCoverageThresholds.branches],
    ['functions', aggregateCoverageThresholds.functions],
    ['lines', aggregateCoverageThresholds.lines],
  ]
  let failed = 0
  for (const [key, floor] of checks) {
    const actual = Number.parseFloat(aggregate[key])
    if (actual < floor) {
      logger.fail(
        `Aggregate coverage ${key} ${actual.toFixed(2)}% is below threshold ${floor}%`,
      )
      failed += 1
    }
  }
  return failed
}

const { values } = parseArgs({
  options: {
    'code-only': { type: 'boolean', default: false },
    'type-only': { type: 'boolean', default: false },
    summary: { type: 'boolean', default: false },
    'update-readme': { type: 'boolean', default: false },
  },
  strict: false,
})

printHeader('Test Coverage')
logger.log('')

const customFlags = [
  '--code-only',
  '--type-only',
  '--summary',
  '--update-readme',
]
const passthroughArgs = process.argv
  .slice(2)
  .filter(arg => !customFlags.includes(arg))

const mainVitestArgs = [
  'exec',
  'vitest',
  'run',
  '--config',
  '.config/repo/vitest.config.mts',
  '--coverage',
  ...passthroughArgs,
]
const isolatedVitestArgs = [
  'exec',
  'vitest',
  'run',
  '--config',
  '.config/repo/vitest.config.isolated.mts',
  '--coverage',
  ...passthroughArgs,
]
const typeCoverageArgs = ['exec', 'type-coverage']

async function main() {
  let exitCode = 0

  try {
    if (values['type-only']) {
      const typeCoverageResult = await runCommandQuiet(
        'pnpm',
        typeCoverageArgs,
        {
          cwd: rootPath,
        },
      )
      exitCode = typeCoverageResult.exitCode

      const typeCoverageOutput = (
        typeCoverageResult.stdout + typeCoverageResult.stderr
      ).trim()
      const typeCoveragePercent = parseTypeCoveragePercent(typeCoverageOutput)

      if (typeCoveragePercent !== undefined) {
        logger.log('')
        logger.log(' Coverage Summary')
        logger.log(' ───────────────────────────────')
        logger.log(` Type Coverage: ${typeCoveragePercent.toFixed(2)}%`)
        logger.log('')
      }
    } else {
      const { combined, mainResult } = await runTestSuites(
        mainVitestArgs,
        isolatedVitestArgs,
      )
      exitCode = combined.exitCode

      const mainOutput = cleanOutput(mainResult.stdout + mainResult.stderr)
      const combinedOutput = cleanOutput(combined.stdout + combined.stderr)

      let typeCoveragePercent: number | undefined
      if (!values['code-only']) {
        const typeCoverageResult = await runCommandQuiet(
          'pnpm',
          typeCoverageArgs,
          { cwd: rootPath },
        )
        const typeCoverageOutput = (
          typeCoverageResult.stdout + typeCoverageResult.stderr
        ).trim()
        typeCoveragePercent = parseTypeCoveragePercent(typeCoverageOutput)
      }

      let aggregateCoverage: AggregateCoverage | undefined
      try {
        aggregateCoverage = await mergeCoverageFinal(rootPath)
      } catch (e) {
        logger.warn(`Could not compute aggregate coverage: ${errorMessage(e)}`)
      }

      displayCodeCoverage(mainOutput, combinedOutput, aggregateCoverage, {
        showDetail: !values['summary'],
        typeCoveragePercent,
      })

      if (aggregateCoverage) {
        const gateFailures = gateAggregate(aggregateCoverage)
        if (gateFailures > 0 && exitCode === 0) {
          exitCode = 1
        }
        if (values['update-readme'] && gateFailures === 0 && exitCode === 0) {
          const pct = Number.parseFloat(aggregateCoverage.statements)
          const updated = await updateReadmeBadge(pct)
          if (updated) {
            logger.success(
              `Updated README coverage badge to ${Math.floor(pct)}%`,
            )
          }
        }
      }
    }

    if (exitCode === 0) {
      logger.success('Coverage completed successfully')
    } else {
      logger.fail('Coverage failed')
    }

    process.exitCode = exitCode
  } catch (e) {
    logger.error(`Coverage script failed: ${errorMessage(e)}`)
    process.exitCode = 1
  }
}

// WIN32 import retained for parity with sibling scripts.
void WIN32

void main()
