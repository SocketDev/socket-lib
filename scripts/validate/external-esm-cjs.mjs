/**
 * @fileoverview Comprehensive ESM/CJS validator for dist/external/* exports
 * Validates that bundled dependencies work correctly with both CommonJS require()
 * and ESM import, including proper handling of default exports and named exports.
 *
 * Key validations:
 * - CJS require() returns usable values without .default wrappers
 * - ESM default imports work correctly
 * - Named exports (like Separator) are accessible from both CJS and ESM
 * - Function exports are directly callable without .default
 * - Object exports preserve all named properties
 */

import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const externalDir = path.resolve(__dirname, '..', '..', 'dist', 'external')
const require = createRequire(import.meta.url)

// Import CommonJS modules using require
const { isQuiet } = require('#socketsecurity/lib/argv/flags')
const { getDefaultLogger } = require('#socketsecurity/lib/logger')
const { normalizePath } = require('#socketsecurity/lib/path')
const { pluralize } = require('#socketsecurity/lib/words')

const logger = getDefaultLogger()

/**
 * Get all .js files recursively in a directory.
 */
function getJsFilesRecursive(dir, files = []) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath)
      } else if (entry.isDirectory()) {
        // Recursively scan all subdirectories
        getJsFilesRecursive(fullPath, files)
      }
    }
  } catch {
    // Directory might not be accessible
  }

  return files
}

/**
 * Get all .js files and directories in the external directory.
 */
function getExternalModules(dir) {
  return getJsFilesRecursive(dir).filter(file => {
    // Ensure the file is actually in the external directory
    // (not some symlink or weird path)
    return file.startsWith(dir)
  })
}

/**
 * Check if module exports work correctly for both CJS and ESM.
 */
async function checkModuleExports(filePath) {
  const relativePath = path.relative(externalDir, filePath)
  const normalizedPath = normalizePath(relativePath)
  const issues = []

  // Test 1: CJS require() - should work without .default
  let cjsModule
  try {
    cjsModule = require(filePath)
  } catch (error) {
    return {
      path: normalizedPath,
      ok: false,
      issues: [`CJS require() failed: ${error.message}`],
    }
  }

  // Validate CJS export structure
  const cjsType = typeof cjsModule
  const cjsKeys =
    cjsType === 'object' && cjsModule !== null ? Object.keys(cjsModule) : []

  // Check for problematic CJS patterns
  if (cjsType === 'object' && cjsModule !== null) {
    // If only key is 'default', it's wrapped incorrectly
    if (cjsKeys.length === 1 && cjsKeys[0] === 'default') {
      issues.push(
        'CJS: Module only exports { default: value } - internal code would need .default accessor',
      )
    }

    // Empty object is suspicious
    if (cjsKeys.length === 0) {
      issues.push(
        'CJS: Module exports empty object - may indicate bundling issue',
      )
    }

    // Check if .default shadows the main export
    if ('default' in cjsModule && cjsModule.default !== undefined) {
      // If .default is a circular reference (module.default === module), that's okay
      if (cjsModule.default !== cjsModule) {
        const nonDefaultKeys = cjsKeys.filter(k => k !== 'default')
        // If there are other exports, this might be intentional (like @inquirer modules)
        // We'll check ESM compatibility below
        if (nonDefaultKeys.length === 0) {
          issues.push(
            'CJS: Module has .default but no other exports - may be wrapped',
          )
        }
      }
    }
  }

  // Test 2: ESM import - should work correctly
  let esmModule
  try {
    // Dynamic import to test ESM interop
    const moduleUrl = pathToFileURL(filePath).href
    esmModule = await import(moduleUrl)
  } catch (error) {
    issues.push(`ESM import failed: ${error.message}`)
    return {
      path: normalizedPath,
      ok: false,
      issues,
    }
  }

  // Validate ESM export structure
  const esmDefault = esmModule.default
  const esmKeys = Object.keys(esmModule).filter(k => k !== 'default')

  // Test 3: ESM/CJS interop validation
  if (cjsType === 'function') {
    // Functions should be importable as default export in ESM
    if (typeof esmDefault !== 'function') {
      issues.push(
        `ESM: Default export should be a function (got ${typeof esmDefault}), but CJS exports function directly`,
      )
    }
  } else if (cjsType === 'object' && cjsModule !== null) {
    // For objects with both default and named exports (like @inquirer modules)
    if ('default' in cjsModule && cjsModule.default !== cjsModule) {
      // ESM should have the default export
      if (esmDefault === undefined) {
        issues.push(
          'ESM: Missing default export, but CJS has .default property',
        )
      }

      // Named exports should be accessible in ESM's default import
      const nonDefaultCjsKeys = cjsKeys.filter(k => k !== 'default')
      for (const key of nonDefaultCjsKeys) {
        // In ESM, named exports appear as properties of the default import
        // when importing a CJS module
        if (!(key in esmModule) && !(key in (esmDefault || {}))) {
          issues.push(
            `ESM: Named export '${key}' not accessible (not in module or default object)`,
          )
        }
      }
    } else {
      // Regular object exports - all CJS keys should be in ESM default
      if (esmDefault && typeof esmDefault === 'object') {
        const esmDefaultKeys = Object.keys(esmDefault)
        for (const key of cjsKeys) {
          if (!esmDefaultKeys.includes(key)) {
            issues.push(
              `ESM: Named export '${key}' missing from default object`,
            )
          }
        }
      }
    }
  }

  // Test 4: Specific checks for @inquirer modules
  if (normalizedPath.startsWith('@inquirer/')) {
    const moduleName = normalizedPath.split('/')[1]

    // confirm, input, password should export functions directly
    if (['confirm', 'input', 'password'].includes(moduleName)) {
      if (cjsType !== 'function') {
        issues.push(
          `@inquirer/${moduleName}: Should export function directly for CJS (got ${cjsType})`,
        )
      }
      if (typeof esmDefault !== 'function') {
        issues.push(
          `@inquirer/${moduleName}: Should export function as default for ESM (got ${typeof esmDefault})`,
        )
      }
    }

    // select, checkbox, search should have both default function and Separator
    if (['select', 'checkbox', 'search'].includes(moduleName)) {
      if (!cjsKeys.includes('Separator')) {
        issues.push(`@inquirer/${moduleName}: Missing Separator export in CJS`)
      }
      if (!('default' in cjsModule)) {
        issues.push(`@inquirer/${moduleName}: Missing default export in CJS`)
      }
      if (typeof cjsModule.default !== 'function') {
        issues.push(
          `@inquirer/${moduleName}: default should be a function (got ${typeof cjsModule.default})`,
        )
      }
      // Check ESM access to Separator
      if (!('Separator' in esmModule)) {
        issues.push(`@inquirer/${moduleName}: Separator not accessible in ESM`)
      }
    }
  }

  return {
    path: normalizedPath,
    ok: issues.length === 0,
    issues,
    cjsKeys: cjsKeys.length,
    esmKeys: esmKeys.length,
    cjsType,
    hasEsmDefault: esmDefault !== undefined,
  }
}

async function main() {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    logger.step('Validating dist/external ESM/CJS exports')
  }

  const modules = getExternalModules(externalDir)

  if (modules.length === 0) {
    if (!quiet) {
      logger.warn('No external modules found to validate')
    }
    return
  }

  // Check all modules
  const results = await Promise.all(modules.map(checkModuleExports))
  const failures = results.filter(r => !r.ok)
  const successes = results.filter(r => r.ok)

  if (failures.length > 0) {
    if (!quiet) {
      logger.fail(
        `Found ${failures.length} external ${pluralize('module', { count: failures.length })} with ESM/CJS export issues:`,
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
        'Ensure esbuild configuration preserves proper export structure',
      )
      logger.substep('Check that external bundles use correct format settings')
      logger.substep(
        'For function exports: Use format that exports function directly',
      )
      logger.substep(
        'For named exports: Ensure all names are accessible from both CJS and ESM',
      )
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      // Summary statistics
      const totalCjsKeys = successes.reduce((sum, r) => sum + r.cjsKeys, 0)
      const modulesWithDefault = successes.filter(r => r.hasEsmDefault).length
      const functionExports = successes.filter(
        r => r.cjsType === 'function',
      ).length
      const objectExports = successes.filter(r => r.cjsType === 'object').length

      logger.success(
        `Validated ${results.length} external ${pluralize('module', { count: results.length })} - all ESM/CJS interop working correctly`,
      )
      if (verbose) {
        logger.substep(`${totalCjsKeys} total CJS exports`)
        logger.substep(`${modulesWithDefault} modules with ESM default export`)
        logger.substep(`${functionExports} function exports`)
        logger.substep(`${objectExports} object exports`)

        // Check @inquirer modules specifically
        const inquirerResults = results.filter(r =>
          r.path.startsWith('@inquirer/'),
        )
        if (inquirerResults.length > 0) {
          logger.log('')
          logger.success(
            `Verified ${inquirerResults.length} @inquirer ${pluralize('module', { count: inquirerResults.length })}:`,
          )
          for (const result of inquirerResults) {
            const hasDefault = result.hasEsmDefault ? '✓ default' : ''
            const hasSeparator =
              result.cjsKeys > 0 ? `✓ ${result.cjsKeys} exports` : ''
            logger.substep(
              `${result.path}: ${[hasDefault, hasSeparator].filter(Boolean).join(', ')}`,
            )
          }
        }
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
