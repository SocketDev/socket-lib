/**
 * @fileoverview Filter coverage data to exclude dist/ and external files
 *
 * This script post-processes V8 coverage data to remove:
 * - dist/ compiled JavaScript files
 * - external bundled dependencies
 * - test files
 * Ensuring coverage reports only show src/ TypeScript files (excluding src/external).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDefaultLogger } from '#socketsecurity/lib/logger'

const logger = getDefaultLogger()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Find all coverage JSON files
const coverageDir = path.join(projectRoot, 'coverage')
if (!fs.existsSync(coverageDir)) {
  logger.error('Coverage directory not found:', coverageDir)
  process.exit(1)
}

const coverageFinalPath = path.join(coverageDir, 'coverage-final.json')
const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json')

function filterCoverageFile(filePath) {
  if (!fs.existsSync(filePath)) {
    logger.info(`Skipping ${path.basename(filePath)} - not found`)
    return { filtered: 0, kept: 0, total: 0, details: {} }
  }

  const coverage = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  const filtered = {}
  let distCount = 0
  let externalCount = 0
  let testCount = 0
  let srcCount = 0

  for (const [file, data] of Object.entries(coverage)) {
    // Exclude dist/ compiled files
    if (file.includes('/dist/') || file.includes('\\dist\\')) {
      distCount++
      continue
    }

    // Exclude external bundled dependencies
    if (
      file.includes('/external/') ||
      file.includes('\\external\\') ||
      file.includes('src/external')
    ) {
      externalCount++
      continue
    }

    // Exclude test files
    if (file.includes('/test/') || file.includes('\\test\\')) {
      testCount++
      continue
    }

    // Keep src/ TypeScript files
    if (file.includes('/src/') || file.includes('\\src\\')) {
      filtered[file] = data
      srcCount++
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2))

  return {
    filtered: distCount + externalCount + testCount,
    kept: srcCount,
    total: Object.keys(coverage).length,
    details: { distCount, externalCount, testCount, srcCount },
  }
}

logger.info('Filtering coverage data...\n')

const finalStats = filterCoverageFile(coverageFinalPath)
logger.info('coverage-final.json:')
logger.success(`  Kept ${finalStats.kept} src/ TypeScript files`)
if (finalStats.filtered > 0) {
  logger.info(`  Filtered ${finalStats.filtered} files:`)
  if (finalStats.details.distCount) {
    logger.info(`    - ${finalStats.details.distCount} dist/ compiled files`)
  }
  if (finalStats.details.externalCount) {
    logger.info(
      `    - ${finalStats.details.externalCount} external dependencies`,
    )
  }
  if (finalStats.details.testCount) {
    logger.info(`    - ${finalStats.details.testCount} test files`)
  }
}
logger.info(`  Total: ${finalStats.total} files\n`)

const summaryStats = filterCoverageFile(coverageSummaryPath)
logger.info('coverage-summary.json:')
logger.success(`  Kept ${summaryStats.kept} src/ files`)
if (summaryStats.filtered > 0) {
  logger.info(`  Filtered ${summaryStats.filtered} files`)
}

logger.success('\n✓ Coverage data filtered successfully!')
