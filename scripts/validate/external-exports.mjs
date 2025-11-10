/**
 * @fileoverview Validate that all dist/external/* exports work correctly for internal use
 * Ensures require('./dist/external/foo') returns usable values without .default wrappers
 * These are bundled dependencies used internally by socket-lib modules.
 */

import { createRequire } from 'node:module'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import colors from 'yoctocolors-cjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const externalDir = path.resolve(__dirname, '..', '..', 'dist', 'external')
const require = createRequire(import.meta.url)

// Normalize path for cross-platform (converts backslashes to forward slashes)
const normalizePath = p => p.split(path.sep).join('/')

// Import CommonJS modules using require
const { isQuiet } = require('#socketsecurity/lib/argv/flags')
const { pluralize } = require('#socketsecurity/lib/words')

// Modules that only export { default } but are correctly handled in code
// via .default accessor (e.g., confirmExport.default ?? confirmExport)
const KNOWN_DEFAULT_ONLY_MODULES = new Set([
  '@inquirer/confirm.js',
  '@inquirer/input.js',
  '@inquirer/password.js',
  '@inquirer/search.js',
  '@inquirer/select.js',
])

/**
 * Get all .js files and directories in the external directory.
 */
function getExternalModules(dir) {
  const modules = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile() && entry.name.endsWith('.js')) {
        modules.push(fullPath)
      } else if (entry.isDirectory()) {
        // For scoped packages like @inquirer, @npmcli, etc.
        // Check if they have index.js or subdirectories
        try {
          const indexPath = path.join(fullPath, 'index.js')
          if (statSync(indexPath).isFile()) {
            modules.push(indexPath)
          }
        } catch {
          // No index.js, might have submodules - recurse
          const subEntries = readdirSync(fullPath, { withFileTypes: true })
          for (const subEntry of subEntries) {
            if (subEntry.isFile() && subEntry.name.endsWith('.js')) {
              modules.push(path.join(fullPath, subEntry.name))
            }
          }
        }
      }
    }
  } catch (error) {
    // External directory might not exist in some build states
    return []
  }

  return modules
}

/**
 * Check if an external module export is usable without .default.
 */
function checkExternalExport(filePath) {
  const relativePath = path.relative(externalDir, filePath)
  const normalizedPath = normalizePath(relativePath)

  try {
    const mod = require(filePath)

    // Check for problematic .default wrapper
    // External modules should be directly usable, not wrapped
    if (typeof mod === 'object' && mod !== null) {
      const keys = Object.keys(mod)

      // If only key is 'default', it's wrapped incorrectly
      if (keys.length === 1 && keys[0] === 'default') {
        // Check if this is a known module that's correctly handled in code
        if (KNOWN_DEFAULT_ONLY_MODULES.has(normalizedPath)) {
          return {
            path: normalizedPath,
            ok: true,
            keys: 'default-only (handled)',
            note: 'Uses .default accessor in code',
          }
        }

        return {
          path: normalizedPath,
          ok: false,
          reason:
            'Module only exports { default: value } - internal code would need .default accessor',
        }
      }

      // If module has .default alongside other exports, check if it's redundant
      if ('default' in mod && mod.default !== undefined) {
        const nonDefaultKeys = keys.filter(k => k !== 'default')

        // Check if .default is a circular reference (module.default === module)
        // This is okay - it's how some modules provide both CJS and ESM compatibility
        if (mod.default === mod) {
          return { path: normalizedPath, ok: true, keys: nonDefaultKeys.length }
        }

        // If .default exists but so do other exports, it might be okay
        // (some modules export both named and default)
        // But warn if .default seems to be the "real" export
        if (
          nonDefaultKeys.length === 0 ||
          (nonDefaultKeys.length > 0 &&
            typeof mod.default === 'object' &&
            Object.keys(mod.default).length > nonDefaultKeys.length)
        ) {
          return {
            path: normalizedPath,
            ok: false,
            reason:
              'Module has .default property that may shadow named exports',
          }
        }
      }

      // Empty object is suspicious
      if (keys.length === 0) {
        return {
          path: normalizedPath,
          ok: false,
          reason: 'Module exports empty object - may indicate bundling issue',
        }
      }

      return { path: normalizedPath, ok: true, keys: keys.length }
    }

    // Primitive exports are okay for some modules
    return { path: normalizedPath, ok: true, keys: 'primitive' }
  } catch (error) {
    return {
      path: normalizedPath,
      ok: false,
      reason: `Failed to require: ${error.message}`,
    }
  }
}

async function main() {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    console.log(`${colors.cyan('→')} Validating dist/external exports`)
  }

  const modules = getExternalModules(externalDir)

  if (modules.length === 0) {
    if (!quiet) {
      console.log(
        colors.yellow('⚠') + ' No external modules found to validate',
      )
    }
    return
  }

  const results = modules.map(checkExternalExport)
  const failures = results.filter(r => !r.ok)

  if (failures.length > 0) {
    if (!quiet) {
      console.error(
        colors.red('✗') +
          ` Found ${failures.length} external ${pluralize('module', { count: failures.length })} with export issues:`,
      )
      for (const failure of failures) {
        console.error(`  ${colors.red('✗')} ${failure.path}`)
        console.error(`    ${failure.reason}`)
      }
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      const totalKeys = results.reduce(
        (sum, r) => sum + (typeof r.keys === 'number' ? r.keys : 0),
        0,
      )
      console.log(
        colors.green('✓') +
          ` Validated ${results.length} external ${pluralize('module', { count: results.length })} - all usable without .default (${totalKeys} total exports)`,
      )
    }
  }
}

main().catch(error => {
  console.error(`${colors.red('✗')} Validation failed:`, error.message)
  process.exitCode = 1
})
