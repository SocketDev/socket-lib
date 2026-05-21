/**
 * @file Code coverage utilities for parsing v8 coverage data.
 */

import process from 'node:process'

import { readJson } from '../fs/read-json'
import { isPlainObject } from '../objects/predicates'
import { spawn } from '../process/spawn/child'

import { ArrayIsArray } from '../primordials/array'

import { ErrorCtor } from '../primordials/error'

import { ObjectValues } from '../primordials/object'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

import type {
  CodeCoverageResult,
  CoverageMetric,
  GetCodeCoverageOptions,
  V8CoverageData,
  V8FileCoverage,
} from './types'

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
  const opts = {
    __proto__: null,
    coveragePath: path.join(process.cwd(), 'coverage/coverage-final.json'),
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
        cwd: process.cwd(),
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

  // Aggregate metrics across all files.
  const totals = {
    __proto__: null,
    branches: { __proto__: null, covered: 0, total: 0 },
    functions: { __proto__: null, covered: 0, total: 0 },
    lines: { __proto__: null, covered: 0, total: 0 },
    statements: { __proto__: null, covered: 0, total: 0 },
  }

  const v8Data = coverageData as V8CoverageData

  for (const fileCoverage of ObjectValues(v8Data)) {
    if (!isPlainObject(fileCoverage)) {
      continue
    }

    const fc = fileCoverage as V8FileCoverage

    // Aggregate statements.
    if (fc.s && isPlainObject(fc.s)) {
      const statementCounts = ObjectValues(fc.s)
      for (const count of statementCounts) {
        if (typeof count === 'number') {
          totals.statements.total += 1
          if (count > 0) {
            totals.statements.covered += 1
          }
        }
      }
    }

    // Aggregate branches.
    if (fc.b && isPlainObject(fc.b)) {
      const branchCounts = ObjectValues(fc.b)
      for (const branches of branchCounts) {
        if (ArrayIsArray(branches)) {
          for (const count of branches) {
            if (typeof count === 'number') {
              totals.branches.total += 1
              if (count > 0) {
                totals.branches.covered += 1
              }
            }
          }
        }
      }
    }

    // Aggregate functions.
    if (fc.f && isPlainObject(fc.f)) {
      const functionCounts = ObjectValues(fc.f)
      for (const count of functionCounts) {
        if (typeof count === 'number') {
          totals.functions.total += 1
          if (count > 0) {
            totals.functions.covered += 1
          }
        }
      }
    }

    // Note: Lines are typically derived from statement map in v8.
    // For simplicity, we use statements as a proxy for lines.
    // In a production implementation, you'd parse statementMap to get actual line coverage.
    totals.lines.covered = totals.statements.covered
    totals.lines.total = totals.statements.total
  }

  // Calculate percentages.
  return {
    branches: calculateMetric(totals.branches),
    functions: calculateMetric(totals.functions),
    lines: calculateMetric(totals.lines),
    statements: calculateMetric(totals.statements),
  }
}
