/**
 * @file Validate that all dist/external/* exports work correctly for internal
 *   use Ensures require('./dist/external/foo') returns usable values without
 *   .default wrappers These are bundled dependencies used internally by
 *   socket-lib modules.
 */

import { createRequire } from 'node:module'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { REPO_ROOT } from '../../fleet/paths.mts'

import { isMainModule } from '../../fleet/_shared/is-main-module.mts'
import { runMain } from '../../fleet/_shared/run-main.mts'

import type { ScriptMeta } from '../../fleet/_shared/run-main.mts'

const externalDir = path.join(REPO_ROOT, 'dist', 'external')
const require = createRequire(import.meta.url)

// Import CommonJS modules using require
const { isQuiet } = require('../quiet.mts')
const { errorMessage } = require('@socketsecurity/lib-stable/errors/message')
const {
  getDefaultLogger,
} = require('@socketsecurity/lib-stable/logger/default')
const { normalizePath } = require('@socketsecurity/lib-stable/paths/normalize')
const { pluralize } = require('@socketsecurity/lib-stable/words/pluralize')

const logger = getDefaultLogger()

/**
 * Get all .js files and directories in the external directory.
 */
export function getExternalModules(dir: string) {
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
  } catch {
    // External directory might not exist in some build states
    return []
  }

  return modules
}

// Packages that legitimately only export { default } (ESM default exports).
// These are optional @inquirer packages that use ESM default export pattern.
const DEFAULT_ONLY_ALLOWED = new Set([
  '@inquirer/confirm.js',
  '@inquirer/input.js',
  '@inquirer/password.js',
])

/**
 * Check if an external module export is usable without .default.
 */
export function checkExternalExport(filePath: string) {
  const relativePath = path.relative(externalDir, filePath)
  const normalizedPath = normalizePath(relativePath)

  try {
    const mod = require(filePath)

    // Check for problematic .default wrapper
    // External modules should be directly usable, not wrapped
    if (typeof mod === 'object' && mod !== null) {
      const keys = Object.keys(mod)

      // If only key is 'default', it's wrapped incorrectly
      // UNLESS it's in the allowed list of packages that legitimately only export default
      if (keys.length === 1 && keys[0] === 'default') {
        if (DEFAULT_ONLY_ALLOWED.has(normalizedPath)) {
          return { path: normalizedPath, ok: true, keys: 1 }
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

        // If .default exists but so do other exports, it might be okay, since
        // some modules export both named and default.
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
  } catch (e) {
    return {
      path: normalizedPath,
      ok: false,
      reason: `Failed to require: ${errorMessage(e)}`,
    }
  }
}

async function main(): Promise<void> {
  try {
    await runValidation()
  } catch (e) {
    logger.fail(`Validation failed: ${errorMessage(e)}`)
    process.exitCode = 1
  }
}

async function runValidation(): Promise<void> {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    logger.step('Validating dist/external exports')
  }

  const modules = getExternalModules(externalDir)

  if (modules.length === 0) {
    if (!quiet) {
      logger.warn('No external modules found to validate')
    }
    return
  }

  const results = modules.map(checkExternalExport)
  const failures = results.filter(r => !r.ok)

  if (failures.length > 0) {
    if (!quiet) {
      logger.fail(
        `Found ${failures.length} external ${pluralize('module', { count: failures.length })} with export issues:`,
      )
      for (let i = 0, { length } = failures; i < length; i += 1) {
        const failure = failures[i]!
        logger.log(`  ${failure.path}`)
        logger.substep(failure.reason)
      }
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      const totalKeys = results.reduce(
        (sum, r) => sum + (typeof r.keys === 'number' ? r.keys : 0),
        0,
      )
      logger.success(
        `Validated ${results.length} external ${pluralize('module', { count: results.length })} - all usable without .default (${totalKeys} total exports)`,
      )
    }
  }
}

const SCRIPT_META: ScriptMeta = {
  describe:
    'validates dist/external/* exports are usable internally without a .default wrapper',
  help: `Usage: node scripts/repo/validate/external-exports.mts [flags]

  --verbose             show detail while validating
  --quiet, --silent     suppress non-error output`,
}

if (isMainModule(import.meta.url)) {
  runMain(main, SCRIPT_META)
}
