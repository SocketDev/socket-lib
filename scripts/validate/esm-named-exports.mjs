/**
 * @fileoverview Validate that dist/* files export named exports compatible with ESM imports
 * Ensures that module.exports = { foo, bar } pattern is used (not module.exports.default)
 * so that ESM code can do: import { foo, bar } from '#socketsecurity/lib/module'
 */

import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import colors from 'yoctocolors-cjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', '..', 'dist')
const require = createRequire(import.meta.url)

// Normalize path for cross-platform (converts backslashes to forward slashes)
const normalizePath = p => p.split(path.sep).join('/')

// Import CommonJS modules using require
const { isQuiet } = require('#socketsecurity/lib/argv/flags')
const { pluralize } = require('#socketsecurity/lib/words')

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
 * Check if a module exports named exports in an ESM-compatible way.
 * Good: module.exports = { foo, bar, baz }
 * Bad: module.exports = value or module.exports.default = value
 */
function checkEsmNamedExports(filePath) {
  // Skip external packages - they are bundled dependencies
  const relativePath = path.relative(distDir, filePath)
  const normalizedPath = normalizePath(relativePath)
  if (normalizedPath.startsWith('external/')) {
    return { path: filePath, ok: true, skipped: true }
  }

  try {
    // Read the file source to check export pattern
    const source = readFileSync(filePath, 'utf-8')

    // Check for problematic patterns
    const hasDefaultExport =
      /module\.exports\s*=\s*\w+\s*;?\s*$/.test(source) ||
      /module\.exports\.default\s*=/.test(source)

    // Check for proper named exports pattern
    const hasNamedExportsObject = /module\.exports\s*=\s*{/.test(source)

    // Also check by actually requiring the module
    let mod
    try {
      mod = require(filePath)
    } catch (requireError) {
      return {
        path: filePath,
        ok: false,
        reason: `Failed to require: ${requireError.message}`,
      }
    }

    // If it's a primitive, it can't have named exports
    if (typeof mod !== 'object' || mod === null) {
      return {
        path: filePath,
        ok: false,
        reason:
          'Module exports a primitive value instead of an object with named exports',
      }
    }

    // If module only has 'default' key, it's not ESM-compatible
    const keys = Object.keys(mod)
    if (keys.length === 1 && keys[0] === 'default') {
      return {
        path: filePath,
        ok: false,
        reason:
          'Module only exports { default: value } - should export named exports directly',
      }
    }

    // If we have suspicious patterns and no proper object exports
    if (hasDefaultExport && !hasNamedExportsObject) {
      // But let's be lenient if the module does have named exports when required
      if (keys.length > 0 && !keys.includes('default')) {
        // It's fine - esbuild generated proper interop
        return { path: filePath, ok: true }
      }

      return {
        path: filePath,
        ok: false,
        reason:
          'Module uses default export pattern instead of named exports object',
      }
    }

    // If we have an empty object, check if it's a type-only file
    if (keys.length === 0) {
      // Type-only files (e.g., cover/types.js, effects/types.js) have no runtime exports
      // These are expected and OK
      const isTypeOnlyFile = normalizedPath.endsWith('/types.js')
      if (isTypeOnlyFile) {
        return { path: filePath, ok: true }
      }
      return {
        path: filePath,
        ok: false,
        reason: 'Module exports an empty object with no named exports',
      }
    }

    return { path: filePath, ok: true }
  } catch (error) {
    return {
      path: filePath,
      ok: false,
      reason: `Failed to analyze: ${error.message}`,
    }
  }
}

async function main() {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    console.log(`${colors.cyan('→')} Validating ESM-compatible named exports`)
  }

  const files = getJsFiles(distDir)
  const results = files.map(checkEsmNamedExports)
  const failures = results.filter(r => !r.ok)

  const checked = results.filter(r => !r.skipped)

  if (failures.length > 0) {
    if (!quiet) {
      console.error(
        colors.red('✗') +
          ` Found ${failures.length} ${pluralize('file', { count: failures.length })} without ESM-compatible named exports:`,
      )
      for (const failure of failures) {
        const relativePath = path.relative(distDir, failure.path)
        console.error(`  ${colors.red('✗')} ${relativePath}`)
        console.error(`    ${failure.reason}`)
      }
      console.error(
        '\n' +
          colors.yellow('Hint:') +
          ' Use module.exports = { foo, bar } pattern for ESM compatibility',
      )
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      console.log(
        colors.green('✓') +
          ` Validated ${checked.length} ${pluralize('file', { count: checked.length })} - all have ESM-compatible named exports`,
      )
    }
  }
}

main().catch(error => {
  console.error(`${colors.red('✗')} Validation failed:`, error.message)
  process.exitCode = 1
})
