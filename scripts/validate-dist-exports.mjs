/**
 * @fileoverview Validate that all dist/* exports work correctly without .default
 * Ensures require('./dist/foo') returns the actual value, not wrapped in { default: value }
 */

import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import colors from 'yoctocolors-cjs'

import { isQuiet } from '#socketsecurity/lib/argv/flags'
import { pluralize } from '#socketsecurity/lib/words'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const require = createRequire(import.meta.url)

/**
 * Get all .js files in a directory recursively.
 */
function getJsFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      getJsFiles(fullPath, files)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Check if a module export needs .default or works directly.
 */
function checkExport(filePath) {
  // Skip external packages - they are internal implementation details
  // used by public dist/* modules. We only validate public exports.
  const relativePath = path.relative(distDir, filePath)
  if (relativePath.startsWith('external/')) {
    return { path: filePath, ok: true, skipped: true }
  }

  try {
    const mod = require(filePath)

    // Handle primitive exports (strings, numbers, etc.)
    if (typeof mod !== 'object' || mod === null) {
      return { path: filePath, ok: true }
    }

    const hasDefault = 'default' in mod && mod.default !== undefined

    // If module has .default and the direct export is empty/different,
    // it's likely incorrectly exported
    if (hasDefault) {
      const directKeys = Object.keys(mod).filter(k => k !== 'default')
      // If only key is 'default', the export is wrapped incorrectly
      if (directKeys.length === 0) {
        return {
          path: filePath,
          ok: false,
          reason: 'Export wrapped in { default: value } - needs .default',
        }
      }
    }

    return { path: filePath, ok: true }
  } catch (error) {
    return {
      path: filePath,
      ok: false,
      reason: `Failed to require: ${error.message}`,
    }
  }
}

async function main() {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    console.log(`${colors.cyan('→')} Validating dist exports`)
  }

  const files = getJsFiles(distDir)
  const results = files.map(checkExport)
  const failures = results.filter(r => !r.ok)

  const checked = results.filter(r => !r.skipped)

  if (failures.length > 0) {
    if (!quiet) {
      console.error(
        colors.red('✗') +
          ` Found ${failures.length} public ${pluralize('export', { count: failures.length })} with incorrect exports:`,
      )
      for (const failure of failures) {
        const relativePath = path.relative(distDir, failure.path)
        console.error(`  ${colors.red('✗')} ${relativePath}`)
        console.error(`    ${failure.reason}`)
      }
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      console.log(
        colors.green('✓') +
          ` Validated ${checked.length} public ${pluralize('export', { count: checked.length })} - all work without .default`,
      )
    }
  }
}

main().catch(error => {
  console.error(`${colors.red('✗')} Validation failed:`, error.message)
  process.exitCode = 1
})
