/**
 * @fileoverview Coverage script that runs tests with coverage reporting.
 * Masks test output and shows only the coverage summary.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { getDefaultLogger } from '#socketsecurity/lib/logger'
import { spawn } from '#socketsecurity/lib/spawn'
import { printHeader } from '#socketsecurity/lib/stdio/header'

import { runCommandQuiet } from '../utils/run-command.mjs'

const logger = getDefaultLogger()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..', '..')

// Parse custom flags
const { values } = parseArgs({
  options: {
    'code-only': { type: 'boolean', default: false },
    'type-only': { type: 'boolean', default: false },
    summary: { type: 'boolean', default: false },
  },
  strict: false,
})

printHeader('Test Coverage')
console.log('')

// Rebuild with source maps enabled for coverage
logger.info('Building with source maps for coverage...')
const buildResult = await spawn('node', ['scripts/build/main.mjs'], {
  cwd: rootPath,
  stdio: 'inherit',
  env: {
    ...process.env,
    COVERAGE: 'true',
  },
})
if (buildResult.code !== 0) {
  logger.error('Build with source maps failed')
  process.exitCode = 1
  process.exit(1)
}

// Run vitest with coverage enabled, capturing output
// Filter out custom flags that vitest doesn't understand
const customFlags = ['--code-only', '--type-only', '--summary']
const vitestArgs = [
  'exec',
  'vitest',
  'run',
  '--coverage',
  ...process.argv.slice(2).filter(arg => !customFlags.includes(arg)),
]
const typeCoverageArgs = ['exec', 'type-coverage']

try {
  let exitCode = 0
  let codeCoverageResult
  let typeCoverageResult

  // Handle --type-only flag
  if (values['type-only']) {
    typeCoverageResult = await runCommandQuiet('pnpm', typeCoverageArgs, {
      cwd: rootPath,
    })
    exitCode = typeCoverageResult.exitCode

    // Display type coverage only
    const typeCoverageOutput = (
      typeCoverageResult.stdout + typeCoverageResult.stderr
    ).trim()
    const typeCoverageMatch = typeCoverageOutput.match(
      /\([\d\s/]+\)\s+([\d.]+)%/,
    )

    if (typeCoverageMatch) {
      const typeCoveragePercent = Number.parseFloat(typeCoverageMatch[1])
      console.log()
      console.log(' Coverage Summary')
      console.log(' ───────────────────────────────')
      console.log(` Type Coverage: ${typeCoveragePercent.toFixed(2)}%`)
      console.log()
    }
  }
  // Handle --code-only flag
  else if (values['code-only']) {
    codeCoverageResult = await runCommandQuiet('pnpm', vitestArgs, {
      cwd: rootPath,
    })
    exitCode = codeCoverageResult.exitCode

    // Process code coverage output only
    const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
    const output = (codeCoverageResult.stdout + codeCoverageResult.stderr)
      .replace(ansiRegex, '')
      .replace(/(?:✧|︎|⚡)\s*/g, '')
      .trim()

    // Extract and display test summary
    const testSummaryMatch = output.match(
      /Test Files\s+\d+[^\n]*\n[\s\S]*?Duration\s+[\d.]+m?s[^\n]*/,
    )
    if (!values.summary && testSummaryMatch) {
      console.log()
      console.log(testSummaryMatch[0])
      console.log()
    }

    // Extract and display coverage summary
    const coverageHeaderMatch = output.match(
      / % Coverage report from v8\n([-|]+)\n([^\n]+)\n\1/,
    )
    // Use src/ directory coverage instead of "All files" to exclude dist/external
    const srcCoverageMatch = output.match(/ src\s+\|\s+([\d.]+)\s+\|[^\n]*/)
    const _allFilesMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|[^\n]*/)

    if (coverageHeaderMatch && srcCoverageMatch) {
      if (!values.summary) {
        console.log(' % Coverage report from v8')
        console.log(coverageHeaderMatch[1])
        console.log(coverageHeaderMatch[2])
        console.log(coverageHeaderMatch[1])
        console.log(srcCoverageMatch[0])
        console.log(coverageHeaderMatch[1])
        console.log()
      }

      const codeCoveragePercent = Number.parseFloat(srcCoverageMatch[1])
      console.log(' Coverage Summary')
      console.log(' ───────────────────────────────')
      console.log(` Code Coverage: ${codeCoveragePercent.toFixed(2)}%`)
      console.log()
    } else if (exitCode !== 0) {
      console.log('\n--- Output ---')
      console.log(output)
    }
  }
  // Default: run both code and type coverage
  else {
    codeCoverageResult = await runCommandQuiet('pnpm', vitestArgs, {
      cwd: rootPath,
    })
    exitCode = codeCoverageResult.exitCode

    // Run type coverage
    typeCoverageResult = await runCommandQuiet('pnpm', typeCoverageArgs, {
      cwd: rootPath,
    })

    // Combine and clean output
    const ansiRegex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
    const output = (codeCoverageResult.stdout + codeCoverageResult.stderr)
      .replace(ansiRegex, '')
      .replace(/(?:✧|︎|⚡)\s*/g, '')
      .trim()

    // Extract test summary
    const testSummaryMatch = output.match(
      /Test Files\s+\d+[^\n]*\n[\s\S]*?Duration\s+[\d.]+m?s[^\n]*/,
    )

    // Extract coverage summary - use src/ directory coverage instead of "All files"
    const coverageHeaderMatch = output.match(
      / % Coverage report from v8\n([-|]+)\n([^\n]+)\n\1/,
    )
    const srcCoverageMatch = output.match(/ src\s+\|\s+([\d.]+)\s+\|[^\n]*/)
    const _allFilesMatch = output.match(/All files\s+\|\s+([\d.]+)\s+\|[^\n]*/)

    // Extract type coverage
    const typeCoverageOutput = (
      typeCoverageResult.stdout + typeCoverageResult.stderr
    ).trim()
    const typeCoverageMatch = typeCoverageOutput.match(
      /\([\d\s/]+\)\s+([\d.]+)%/,
    )

    // Display output
    if (!values.summary && testSummaryMatch) {
      console.log()
      console.log(testSummaryMatch[0])
      console.log()
    }

    if (coverageHeaderMatch && srcCoverageMatch) {
      if (!values.summary) {
        console.log(' % Coverage report from v8')
        console.log(coverageHeaderMatch[1])
        console.log(coverageHeaderMatch[2])
        console.log(coverageHeaderMatch[1])
        console.log(srcCoverageMatch[0])
        console.log(coverageHeaderMatch[1])
        console.log()
      }

      // Display cumulative summary
      if (typeCoverageMatch) {
        const codeCoveragePercent = Number.parseFloat(srcCoverageMatch[1])
        const typeCoveragePercent = Number.parseFloat(typeCoverageMatch[1])
        const cumulativePercent = (
          (codeCoveragePercent + typeCoveragePercent) /
          2
        ).toFixed(2)

        console.log(' Coverage Summary')
        console.log(' ───────────────────────────────')
        console.log(` Type Coverage: ${typeCoveragePercent.toFixed(2)}%`)
        console.log(` Code Coverage: ${codeCoveragePercent.toFixed(2)}%`)
        console.log(' ───────────────────────────────')
        console.log(` Cumulative:    ${cumulativePercent}%`)
        console.log()
      }
    } else if (exitCode !== 0) {
      console.log('\n--- Output ---')
      console.log(output)
    }
  }

  // Filter coverage data to exclude dist/ and external files
  if (exitCode === 0) {
    logger.info('Filtering coverage data to src/ files only...')
    try {
      const filterResult = await spawn('node', ['scripts/test/filter.mjs'], {
        cwd: rootPath,
        stdio: 'inherit',
      })
      if (filterResult.code !== 0) {
        logger.warn('Coverage filtering had issues but continuing...')
      }
    } catch (filterError) {
      logger.warn(`Coverage filtering failed: ${filterError.message}`)
    }
  }

  if (exitCode === 0) {
    logger.success('Coverage completed successfully')
  } else {
    logger.error('Coverage failed')
  }

  process.exitCode = exitCode
} catch (error) {
  logger.error(`Coverage script failed: ${error.message}`)
  process.exitCode = 1
}
