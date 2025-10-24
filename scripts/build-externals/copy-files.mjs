/**
 * @fileoverview File copying utilities for external dependencies.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Ensure directory exists.
 *
 * @param {string} dir - Directory path
 * @returns {Promise<void>}
 */
export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Copy local TypeScript declaration files.
 *
 * @param {string} srcDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<number>} Number of files copied
 */
export async function copyLocalFiles(srcDir, destDir, quiet = false) {
  const dtsFiles = await fs.readdir(srcDir)
  let count = 0

  for (const file of dtsFiles) {
    if (file.endsWith('.d.ts')) {
      await fs.copyFile(path.join(srcDir, file), path.join(destDir, file))
      if (!quiet) {
        console.log(`  Copied ${file}`)
      }
      count++
    }
  }

  return count
}

/**
 * Recursively copy a directory.
 *
 * @param {string} srcPath - Source path
 * @param {string} destPath - Destination path
 * @param {string} relativePath - Relative path for logging
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<number>} Number of files copied
 */
export async function copyRecursive(
  srcPath,
  destPath,
  relativePath = '',
  quiet = false,
) {
  await ensureDir(destPath)
  const entries = await fs.readdir(srcPath, { withFileTypes: true })
  let count = 0

  for (const entry of entries) {
    const srcEntry = path.join(srcPath, entry.name)
    const destEntry = path.join(destPath, entry.name)
    const relPath = path.join(relativePath, entry.name)

    if (entry.isDirectory()) {
      // Recursively copy directory
      count += await copyRecursive(srcEntry, destEntry, relPath, quiet)
    } else {
      // Only copy if the file doesn't already exist (i.e., wasn't bundled).
      try {
        await fs.access(destEntry)
        // File exists (was bundled), skip copying.
      } catch {
        // File doesn't exist, copy it.
        await fs.copyFile(srcEntry, destEntry)
        if (!quiet) {
          console.log(`  Copied ${relPath}`)
        }
        count++
      }
    }
  }

  return count
}

/**
 * Copy scoped package directories.
 *
 * @param {string} srcDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {Array} scopedPackages - List of scoped packages
 * @param {boolean} quiet - Suppress output
 * @returns {Promise<number>} Number of files copied
 */
export async function copyScopedFiles(
  srcDir,
  destDir,
  scopedPackages,
  quiet = false,
) {
  let count = 0

  for (const { scope } of scopedPackages) {
    const scopeSrcDir = path.join(srcDir, scope)
    const scopeDistDir = path.join(destDir, scope)

    try {
      count += await copyRecursive(scopeSrcDir, scopeDistDir, scope, quiet)
    } catch {
      // Scope directory doesn't exist.
    }
  }

  return count
}
