/**
 * @fileoverview File copying utilities for external dependencies.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'

const logger = getDefaultLogger()

/**
 * Ensure directory exists.
 */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Copy local TypeScript declaration files only.
 * JavaScript files are either bundled by esbuild or manually vendored (handled separately).
 */
export async function copyLocalFiles(
  srcDir: string,
  destDir: string,
  quiet: boolean = false,
): Promise<number> {
  const files = await fs.readdir(srcDir)
  let count = 0

  for (const file of files) {
    // Only copy .d.ts files (hand-written type definitions)
    // .js files are either bundled by esbuild or don't need to be in dist
    if (file.endsWith('.d.ts')) {
      const srcPath = path.join(srcDir, file)
      const destPath = path.join(destDir, file)

      await fs.copyFile(srcPath, destPath)
      if (!quiet) {
        logger.log(`  Copied ${file}`)
      }
      count++
    }
  }

  return count
}

/**
 * Recursively copy a directory.
 */
export async function copyRecursive(
  srcPath: string,
  destPath: string,
  relativePath: string = '',
  quiet: boolean = false,
): Promise<number> {
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
    } else if (!existsSync(destEntry)) {
      // File doesn't exist (wasn't bundled), copy it.
      await fs.copyFile(srcEntry, destEntry)
      if (!quiet) {
        logger.log(`  Copied ${relPath}`)
      }
      count++
    }
  }

  return count
}

/**
 * Copy scoped package directories.
 */
export async function copyScopedFiles(
  srcDir: string,
  destDir: string,
  scopedPackages: Array<{ scope: string }>,
  quiet: boolean = false,
): Promise<number> {
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
