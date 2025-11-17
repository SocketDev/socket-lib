/**
 * @fileoverview Validate that external .d.ts files use proper module export patterns.
 * Ensures type definitions are compatible with static ES6 imports and don't require
 * ESLint disables or @ts-expect-error comments.
 *
 * Key validations:
 * - No `declare module` patterns (should use direct exports)
 * - No `export = ` (CommonJS style - should use `export` or `export const/function`)
 * - Files are proper TypeScript modules (have at least one export)
 * - Type definitions match the actual module structure
 */

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const externalDir = path.resolve(__dirname, '..', '..', 'src', 'external')
const require = createRequire(import.meta.url)

// Import CommonJS modules using require
const { isQuiet } = require('@socketsecurity/lib-stable/argv/flags')
const { getDefaultLogger } = require('@socketsecurity/lib-stable/logger')
const { normalizePath } = require('@socketsecurity/lib-stable/paths/normalize')
const { pluralize } = require('@socketsecurity/lib-stable/words')

const logger = getDefaultLogger()

/**
 * Get all .d.ts files recursively in a directory.
 */
function getDtsFilesRecursive(dir, files = []) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile() && entry.name.endsWith('.d.ts')) {
        files.push(fullPath)
      } else if (entry.isDirectory()) {
        getDtsFilesRecursive(fullPath, files)
      }
    }
  } catch {
    // Directory might not be accessible
  }

  return files
}

/**
 * Check if a .d.ts file uses proper module export patterns.
 */
function checkTypeDefinition(filePath) {
  const relativePath = path.relative(externalDir, filePath)
  const normalizedPath = normalizePath(relativePath)
  const issues = []

  let content
  try {
    content = readFileSync(filePath, 'utf8')
  } catch (error) {
    return {
      path: normalizedPath,
      ok: false,
      issues: [`Failed to read file: ${error.message}`],
    }
  }

  // Check for problematic patterns
  const lines = content.split('\n')
  let hasExport = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const lineNum = i + 1

    // Skip comments and empty lines
    if (line.startsWith('//') || line.startsWith('/*') || line === '') {
      continue
    }

    // Check for `declare module` pattern (ambient declarations)
    if (line.startsWith('declare module')) {
      issues.push(
        `Line ${lineNum}: Uses 'declare module' (ambient declaration) - should be a proper module with direct exports`,
      )
    }

    // Check for `export = ` pattern (CommonJS style)
    if (/^export\s*=/.test(line)) {
      issues.push(
        `Line ${lineNum}: Uses 'export =' (CommonJS style) - should use ES6 'export' or 'export const/function/interface'`,
      )
    }

    // Check for exports
    if (
      line.startsWith('export ') ||
      line.startsWith('export{') ||
      line.includes('export ')
    ) {
      hasExport = true
    }
  }

  // Check if file has at least one export (is a proper module)
  if (!hasExport && content.trim() !== '') {
    issues.push(
      'File has no exports - should be a proper TypeScript module with at least one export',
    )
  }

  // Check for specific external modules that might need special attention
  const fileName = path.basename(filePath, '.d.ts')

  // Validate known external modules
  if (fileName === 'semver') {
    // Ensure semver has key functions
    const requiredExports = ['coerce', 'compare', 'parse', 'valid', 'satisfies']
    for (const exportName of requiredExports) {
      if (!content.includes(`export function ${exportName}`)) {
        issues.push(`Missing required export: 'export function ${exportName}'`)
      }
    }
  }

  if (fileName === 'fast-sort') {
    if (!content.includes('export function createNewSortInstance')) {
      issues.push(
        "Missing required export: 'export function createNewSortInstance'",
      )
    }
  }

  if (fileName === 'extensions') {
    if (!content.includes('export const packageExtensions')) {
      issues.push("Missing required export: 'export const packageExtensions'")
    }
  }

  return {
    path: normalizedPath,
    ok: issues.length === 0,
    issues,
    hasExport,
  }
}

async function main() {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    logger.step('Validating src/external type definitions')
  }

  const dtsFiles = getDtsFilesRecursive(externalDir)

  if (dtsFiles.length === 0) {
    if (!quiet) {
      logger.warn('No .d.ts files found in src/external')
    }
    return
  }

  const results = dtsFiles.map(checkTypeDefinition)
  const failures = results.filter(r => !r.ok)
  const successes = results.filter(r => r.ok)

  if (failures.length > 0) {
    if (!quiet) {
      logger.fail(
        `Found ${failures.length} .d.ts ${pluralize('file', { count: failures.length })} with issues:`,
      )
      for (const failure of failures) {
        logger.log(`  ${failure.path}`)
        for (const issue of failure.issues) {
          logger.substep(issue)
        }
      }
      logger.log('')
      logger.warn('Recommended fixes:')
      logger.substep(
        "Replace 'declare module' with direct exports (export const/function/interface)",
      )
      logger.substep(
        "Replace 'export =' with ES6 'export' or 'export const/function'",
      )
      logger.substep(
        'Ensure all .d.ts files are proper TypeScript modules with exports',
      )
      logger.substep(
        'Type definitions should match actual module structure for proper IntelliSense',
      )
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      logger.success(
        `Validated ${results.length} .d.ts ${pluralize('file', { count: results.length })} - all use proper module export patterns`,
      )
      if (verbose) {
        logger.substep(`${successes.length} files with ES6 exports`)
        logger.substep('No ambient declarations or CommonJS exports found')
      }
    }
  }
}

main().catch(error => {
  logger.fail(`Validation failed: ${error.message}`)
  if (!isQuiet() && error.stack) {
    logger.log(error.stack)
  }
  process.exitCode = 1
})
