/**
 * @fileoverview Simplified path utilities for build scripts.
 *
 * This is intentionally separate from src/lib/path/* to avoid circular
 * dependencies where build scripts depend on the built dist output.
 */

import path from 'node:path'

/**
 * Normalize a file path to use forward slashes
 *
 * @param {string} filePath - Path to normalize
 * @returns {string}
 */
export function normalizePath(filePath) {
  return path.normalize(filePath).split(path.sep).join('/')
}
