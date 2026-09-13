/**
 * @file Local package resolution for development. Checks for
 *   repository-contained workspace packages.
 */

import { existsSync, promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'
import { isPathWithinRoot } from '@socketsecurity/lib-stable/paths/predicates'

/**
 * Check if repository-contained workspace packages exist. Used for
 * development to use local changes instead of published packages.
 *
 * @param {string} packageName - The package name to search for.
 * @param {string} rootDir - The root directory of the project.
 *
 * @returns {Promise<string | null>} Path to local package or null
 */
export async function getLocalPackagePath(
  packageName: string,
  rootDir: string,
) {
  const checks = []

  // Check workspace packages (e.g. @socketregistry/yocto-spinner).
  if (/^@socketregistry\/[a-z0-9][a-z0-9._-]*$/i.test(packageName)) {
    const pkgName = packageName.replace('@socketregistry/', '')
    const workspacePath = path.resolve(rootDir, 'packages', 'npm', pkgName)
    checks.push(workspacePath)
  }

  // Return first existing path.
  for (let i = 0, { length } = checks; i < length; i += 1) {
    const checkPath = checks[i]!
    if (
      existsSync(path.join(checkPath, 'package.json')) &&
      isPathWithinRoot(realpathSync(checkPath), realpathSync(rootDir)) &&
      isPathWithinRoot(
        realpathSync(path.join(checkPath, 'package.json')),
        realpathSync(rootDir),
      )
    ) {
      return checkPath
    }
  }

  return undefined
}

/**
 * Resolve the entry point for a local package.
 *
 * @param {string} localPath - Path to the local package.
 *
 * @returns {Promise<string>} Entry point path
 */
export async function resolveLocalEntryPoint(localPath: string) {
  const localPkgJson = JSON.parse(
    await fs.readFile(path.join(localPath, 'package.json'), 'utf8'),
  )

  // Resolve the main export - handle nested exports structure.
  let mainExport = localPkgJson.main || 'index.js'
  const exportsField = localPkgJson.exports?.['.']

  if (exportsField) {
    if (typeof exportsField === 'string') {
      mainExport = exportsField
    } else if (typeof exportsField === 'object') {
      // Try to find default export in nested structure.
      mainExport =
        exportsField.node?.default?.default ||
        exportsField.node?.default ||
        exportsField.default?.default ||
        exportsField.default ||
        mainExport
    }
  }

  const entry = path.resolve(localPath, mainExport)
  assertLocalEntry(localPath, entry)
  return entry
}

function assertLocalEntry(localPath: string, entry: string): void {
  if (
    !isPathWithinRoot(entry, path.resolve(localPath)) ||
    (existsSync(entry) &&
      !isPathWithinRoot(realpathSync(entry), realpathSync(localPath)))
  ) {
    throw new Error(
      `Local package entry escapes its package. Where: ${entry}. Saw an external entry; wanted contained source. Fix: use the declared installed package.`,
    )
  }
}
