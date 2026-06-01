/**
 * @file Shared infrastructure for the Claude Code utilities CLI: storage paths,
 *   pricing tables, the inline logger, low-level command runners, the response
 *   cache, and root-cause analysis helpers. Imported by the command modules.
 *   The runners live in ./claude-core-runners.mts and the analysis helpers in
 *   ./claude-core-analysis.mts; both are re-exported here so existing importers
 *   keep working.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { deleteAsync as del } from 'del'
import colors from 'yoctocolors-cjs'

import {
  CLAUDE_HOME,
  REPO_STORAGE,
  RETENTION,
  STORAGE_PATHS,
  logger,
} from './claude-core-shared.mts'

export {
  CLAUDE_HOME,
  claudeDir,
  log,
  logger,
  parentPath,
  PRICING,
  REPO_STORAGE,
  RETENTION,
  rootPath,
  SOCKET_PROJECTS,
  STORAGE_PATHS,
  WIN32,
} from './claude-core-shared.mts'
export { runCommand, runCommandWithOutput } from './claude-core-runners.mts'
export {
  analyzeRootCause,
  celebrateSuccess,
  displayAnalysis,
  findSimilarErrors,
  hashError,
  loadErrorHistory,
  runPreCommitScan,
  saveErrorHistory,
} from './claude-core-analysis.mts'

export function printHeader(title) {
  logger.log('')
  logger.log(`${'─'.repeat(60)}`)
  logger.log(`  ${title}`)
  logger.log(`${'─'.repeat(60)}`)
}

export function printFooter(message) {
  logger.log('')
  logger.log(`${'─'.repeat(60)}`)
  if (message) {
    logger.log(`  ${colors.green('✓')} ${message}`)
  }
}

/**
 * Initialize storage directories.
 */
export async function initStorage() {
  await fs.mkdir(CLAUDE_HOME, { recursive: true })
  await fs.mkdir(STORAGE_PATHS.cache, { recursive: true })
  await fs.mkdir(REPO_STORAGE.snapshots, { recursive: true })
  await fs.mkdir(REPO_STORAGE.scratch, { recursive: true })
}

/**
 * Clean up old data using del package.
 */
export async function cleanupOldData() {
  const now = Date.now()

  // Clean old snapshots in current repo.
  try {
    const snapshots = await fs.readdir(REPO_STORAGE.snapshots)
    const toDelete = []
    for (const snap of snapshots) {
      const snapPath = path.join(REPO_STORAGE.snapshots, snap)
      // oxlint-disable-next-line socket/prefer-exists-sync -- reads mtime to age out old snapshots, not just existence.
      const stats = await fs.stat(snapPath)
      if (now - stats.mtime.getTime() > RETENTION.snapshots) {
        toDelete.push(snapPath)
      }
    }
    if (toDelete.length > 0) {
      // Force delete temp directories outside CWD.
      await del(toDelete, { force: true })
    }
  } catch {
    // Ignore errors if directory doesn't exist.
  }

  // Clean old cache entries in ~/.claude/cache/.
  try {
    const cached = await fs.readdir(STORAGE_PATHS.cache)
    const toDelete = []
    for (const file of cached) {
      const filePath = path.join(STORAGE_PATHS.cache, file)
      // oxlint-disable-next-line socket/prefer-exists-sync -- reads mtime to age out stale cache entries, not just existence.
      const stats = await fs.stat(filePath)
      if (now - stats.mtime.getTime() > RETENTION.cache) {
        toDelete.push(filePath)
      }
    }
    if (toDelete.length > 0) {
      // Force delete temp directories outside CWD.
      await del(toDelete, { force: true })
    }
  } catch {
    // Ignore errors if directory doesn't exist.
  }
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

// Simple cache for Claude responses with automatic cleanup
const claudeCache = new Map()
// 5 minutes
const CACHE_TTL = 5 * 60 * 1000

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of claudeCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      claudeCache.delete(key)
    }
  }
  // unref() allows process to exit if this is the only timer.
}, CACHE_TTL).unref()
