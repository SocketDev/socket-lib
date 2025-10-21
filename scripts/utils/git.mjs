/**
 * @fileoverview Simplified git utilities for build scripts.
 *
 * This is intentionally separate from src/git/* to avoid circular
 * dependencies where build scripts depend on the built dist output.
 */

import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Get changed files in the working directory
 *
 * @param {object} options - Options
 * @param {boolean} [options.absolute=true] - Return absolute paths
 * @returns {Promise<string[]>}
 */
export async function getChangedFiles(options = {}) {
  const { absolute = true } = options

  try {
    const output = execSync('git diff --name-only HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    const files = output
      .split('\n')
      .filter(Boolean)
      .map(file => (absolute ? path.resolve(file) : file))

    return files
  } catch {
    return []
  }
}

/**
 * Get staged files
 *
 * @param {object} options - Options
 * @param {boolean} [options.absolute=true] - Return absolute paths
 * @returns {Promise<string[]>}
 */
export async function getStagedFiles(options = {}) {
  const { absolute = true } = options

  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    const files = output
      .split('\n')
      .filter(Boolean)
      .map(file => (absolute ? path.resolve(file) : file))

    return files
  } catch {
    return []
  }
}

/**
 * Get changed files synchronously
 *
 * @param {object} options - Options
 * @param {boolean} [options.absolute=true] - Return absolute paths
 * @returns {string[]}
 */
export function getChangedFilesSync(options = {}) {
  const { absolute = true } = options

  try {
    const output = execSync('git diff --name-only HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    const files = output
      .split('\n')
      .filter(Boolean)
      .map(file => (absolute ? path.resolve(file) : file))

    return files
  } catch {
    return []
  }
}

/**
 * Get staged files synchronously
 *
 * @param {object} options - Options
 * @param {boolean} [options.absolute=true] - Return absolute paths
 * @returns {string[]}
 */
export function getStagedFilesSync(options = {}) {
  const { absolute = true } = options

  try {
    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

    const files = output
      .split('\n')
      .filter(Boolean)
      .map(file => (absolute ? path.resolve(file) : file))

    return files
  } catch {
    return []
  }
}
