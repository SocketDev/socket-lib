/**
 * @file Code coverage utilities for parsing v8 coverage data.
 */

import { readJson } from '../fs/read-json.mjs'
import { isPlainObject } from '../objects/predicates.mjs'
import { spawn } from '../process/spawn/child.mjs'

import { ArrayIsArray } from '../primordials/array.mjs'

import { ErrorCtor } from '../primordials/error.mjs'

import { ObjectValues } from '../primordials/object.mjs'

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'

import type {
  CodeCoverageResult,
  CoverageMetric,
  GetCodeCoverageOptions,
  V8CoverageData,
  V8FileCoverage,
} from './types.mjs'
import { getNodeProcess } from '../node/process.mjs'

/**
 * Calculate coverage metric with percentage.
 */
export function calculateMetric(data: {
  covered: number
  total: number
}): CoverageMetric {
  const percent =
    data.total === 0 ? '0.00' : ((data.covered / data.total) * 100).toFixed(2)

  return {
    covered: data.covered,
    percent,
    total: data.total,
  }
}

/**
 * Get code coverage metrics from v8 coverage-final.json.
 *
 * @throws {Error} When coverage file doesn't exist and generateIfMissing is
 *   false.
 * @throws {Error} When coverage data format is invalid.
 */
export async function getCodeCoverage(
  options?: GetCodeCoverageOptions | undefined,
): Promise<CodeCoverageResult> {
  const path = getNodePath()
  const nodeProcess = getNodeProcess()
  const opts = {
    __proto__: null,
    coveragePath: path.join(nodeProcess.cwd(), 'coverage/coverage-final.json'),
    generateIfMissing: false,
    ...options,
  } as GetCodeCoverageOptions

  const { coveragePath, generateIfMissing } = opts

  if (!coveragePath) {
    throw new ErrorCtor('Coverage path is required')
  }

  // Check if coverage file exists.
  const fs = getNodeFs()
  if (!fs.existsSync(coveragePath)) {
    if (generateIfMissing) {
      // Run vitest to generate coverage.
      await spawn('vitest', ['run', '--coverage'], {
        cwd: nodeProcess.cwd(),
        stdio: 'inherit',
      })
    } else {
      throw new ErrorCtor(
        `Coverage file not found at "${coveragePath}". Run tests with coverage first.`,
      )
    }
  }

  // Read and parse coverage-final.json.
  const coverageData = (await readJson(coveragePath)) as unknown

  if (!isPlainObject(coverageData)) {
    throw new ErrorCtor(`Invalid coverage data format in "${coveragePath}"`)
  }

  const totals = aggregateCodeCoverage(coverageData as V8CoverageData)

  // Calculate percentages.
  return {
    branches: calculateMetric(totals.branches),
    functions: calculateMetric(totals.functions),
    lines: calculateMetric(totals.lines),
    statements: calculateMetric(totals.statements),
  }
  function addCodeCoverageCounts(
    metricTotals: { covered: number; total: number },
    counts: unknown,
  ): void {
    if (isPlainObject(counts)) {
      addCodeCoverageValues(metricTotals, ObjectValues(counts))
    }
  }

  function addCodeCoverageValues(
    metricTotals: { covered: number; total: number },
    counts: readonly unknown[],
  ): void {
    for (const count of counts) {
      if (typeof count === 'number') {
        metricTotals.total += 1
        if (count > 0) {
          metricTotals.covered += 1
        }
      }
    }
  }
  function aggregateCodeCoverage(filesData: V8CoverageData) {
    // Aggregate metrics across all files.
    const aggregateTotals = {
      __proto__: null,
      branches: { __proto__: null, covered: 0, total: 0 },
      functions: { __proto__: null, covered: 0, total: 0 },
      lines: { __proto__: null, covered: 0, total: 0 },
      statements: { __proto__: null, covered: 0, total: 0 },
    }

    for (const fileCoverage of ObjectValues(filesData)) {
      if (!isPlainObject(fileCoverage)) {
        continue
      }

      const fc = fileCoverage as V8FileCoverage

      addCodeCoverageCounts(aggregateTotals.statements, fc.s)
      addCodeCoverageCounts(aggregateTotals.functions, fc.f)
      if (isPlainObject(fc.b)) {
        for (const branches of ObjectValues(fc.b)) {
          if (ArrayIsArray(branches)) {
            addCodeCoverageValues(aggregateTotals.branches, branches)
          }
        }
      }

      // Note: Lines are typically derived from statement map in v8.
      // For simplicity, we use statements as a proxy for lines.
      // In a production implementation, you'd parse statementMap to get actual line coverage.
      aggregateTotals.lines.covered = aggregateTotals.statements.covered
      aggregateTotals.lines.total = aggregateTotals.statements.total
    }

    return aggregateTotals
  }
}
