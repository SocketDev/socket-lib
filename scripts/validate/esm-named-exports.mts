/**
 * @file Validate that dist/* files export named exports compatible with ESM
 *   imports Ensures that module.exports = { foo, bar } pattern is used (not
 *   module.exports.default) so that ESM code can do: import { foo, bar } from
 *   '@socketsecurity/lib-stable/module'
 */

import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { isMainModule } from '../fleet/process/is-main-module.mts'

import { REPO_ROOT } from '../fleet/paths.mts'
import { errorMessage } from '@socketsecurity/lib-stable/errors/message'

const distDir = path.join(REPO_ROOT, 'dist')
const require = createRequire(import.meta.url)

// Import CommonJS modules using require
const { isQuiet } = require('../repo/flags/predicates.mts')
const {
  getDefaultLogger,
} = require('@socketsecurity/lib-stable/logger/default')
const { normalizePath } = require('@socketsecurity/lib-stable/paths/normalize')
const { pluralize } = require('@socketsecurity/lib-stable/words/pluralize')

const logger = getDefaultLogger()

/**
 * Check if a module exports named exports in an ESM-compatible way. Good:
 * module.exports = { foo, bar, baz } Bad: module.exports = value or
 * module.exports.default = value.
 */
export function checkEsmNamedExports(filePath: string) {
  // Skip external packages - they are bundled dependencies
  const relativePath = path.relative(distDir, filePath)
  const normalizedPath = normalizePath(relativePath)
  if (normalizedPath.startsWith('external/')) {
    return { __proto__: null, path: filePath, ok: true, skipped: true }
  }
  // Skip CLI entry points (any file with a `#!/usr/bin/env node` shebang) —
  // they side-effect-run at load time, not modules with named exports. A
  // shebang is the unambiguous signal regardless of location: `bin/` entries
  // the package.json `bin` field points at, but also stand-alone hosts like
  // `native-messaging/run.js` that an OS manifest invokes directly. Sibling
  // files that DO export named symbols (subcommand handlers imported by the
  // entry) have no shebang and still go through the regular check.
  try {
    const head = readFileSync(filePath, 'utf-8').slice(0, 256)
    if (head.startsWith('#!/usr/bin/env node')) {
      return { __proto__: null, path: filePath, ok: true, skipped: true }
    }
  } catch {
    // Fall through — let the regular check report a real read error.
  }

  try {
    // Read the file source to check export pattern
    const source = readFileSync(filePath, 'utf-8')

    // Check for problematic patterns
    const hasDefaultExport =
      // Dist files are compiled CJS; text-matching detects single-value
      // exports invisible at require() time.
      // oxlint-disable-next-line socket/no-source-sniffing -- compiled CJS
      /module\.exports\s*=\s*\w+\s*;?\s*$/.test(source) ||
      // Dist files are compiled CJS; text-matching detects
      // module.exports.default= which require() cannot distinguish from
      // named exports.
      // oxlint-disable-next-line socket/no-source-sniffing -- compiled CJS
      /module\.exports\.default\s*=/.test(source)

    // Check for proper named exports pattern
    // Dist files are compiled CJS; text-matching distinguishes object-form
    // exports from single-value form, complementing the require() shape
    // check.
    // oxlint-disable-next-line socket/no-source-sniffing -- compiled CJS
    const hasNamedExportsObject = /module\.exports\s*=\s*{/.test(source)

    // Also check by actually requiring the module
    let mod
    try {
      mod = require(filePath)
    } catch (requireError) {
      return {
        __proto__: null,
        path: filePath,
        ok: false,
        reason: `Failed to require: ${errorMessage(requireError)}`,
      }
    }

    const reason = namedExportIssue(mod, normalizedPath, {
      hasDefaultExport,
      hasNamedExportsObject,
    })
    return reason
      ? { __proto__: null, path: filePath, ok: false, reason }
      : { __proto__: null, path: filePath, ok: true }
  } catch (e) {
    return {
      __proto__: null,
      path: filePath,
      ok: false,
      reason: `Failed to analyze: ${errorMessage(e)}`,
    }
  }
}

function namedExportIssue(
  mod: unknown,
  normalizedPath: string,
  options?:
    | {
        hasDefaultExport?: boolean | undefined
        hasNamedExportsObject?: boolean | undefined
      }
    | undefined,
): string | undefined {
  const { hasDefaultExport, hasNamedExportsObject } = {
    __proto__: null,
    ...options,
  }
  if (typeof mod !== 'object' || mod === null) {
    return 'Module exports a primitive value instead of an object with named exports'
  }
  const keys = Object.keys(mod)
  if (keys.length === 1 && keys[0] === 'default') {
    return 'Module only exports { default: value } - should export named exports directly'
  }
  if (hasDefaultExport && !hasNamedExportsObject) {
    return keys.length > 0 && !keys.includes('default')
      ? undefined
      : 'Module uses default export pattern instead of named exports object'
  }
  if (
    keys.length === 0 &&
    !normalizedPath.endsWith('/types.js') &&
    !normalizedPath.endsWith('-types.js')
  ) {
    return 'Module exports an empty object with no named exports'
  }
  return undefined
}

/**
 * Get all .js files in a directory recursively.
 */
export function getJsFiles(
  dir: string,
  { files = [] }: { files?: string[] | undefined } = {},
) {
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      getJsFiles(fullPath, { files })
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  }

  return files
}

async function main(): Promise<void> {
  const quiet = isQuiet()
  const verbose = process.argv.includes('--verbose')

  if (!quiet && verbose) {
    logger.step('Validating ESM-compatible named exports')
  }

  const files = getJsFiles(distDir)
  const results = files.map(checkEsmNamedExports)
  const failures = results.filter(r => !r.ok)

  const checked = results.filter(r => !r.skipped)

  if (failures.length > 0) {
    if (!quiet) {
      logger.fail(
        `Found ${failures.length} ${pluralize('file', { count: failures.length })} without ESM-compatible named exports:`,
      )
      for (let i = 0, { length } = failures; i < length; i += 1) {
        const failure = failures[i]!
        const relativePath = path.relative(distDir, failure.path)
        logger.log(`  ${relativePath}`)
        logger.substep(failure.reason)
      }
      logger.warn(
        'Hint: Use module.exports = { foo, bar } pattern for ESM compatibility',
      )
    }
    process.exitCode = 1
  } else {
    if (!quiet) {
      logger.success(
        `Validated ${checked.length} ${pluralize('file', { count: checked.length })} - all have ESM-compatible named exports`,
      )
    }
  }
}

if (isMainModule(import.meta.url)) {
  main().catch(error => {
    logger.fail(`Validation failed: ${error.message}`)
    process.exitCode = 1
  })
}
