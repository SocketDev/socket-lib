/**
 * @file Shared constants, storage paths, pricing tables, and the inline logger
 *   for the Claude Code utilities CLI. Imported by the claude-core modules.
 */

import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import colors from 'yoctocolors-cjs'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

export const logger = getDefaultLogger()

const dirname = path.dirname(fileURLToPath(import.meta.url))
export const rootPath = path.join(dirname, '..')
export const parentPath = path.join(rootPath, '..')
export const claudeDir = path.join(rootPath, '.claude')
export const WIN32 = process.platform === 'win32'

// Socket project names.
export const SOCKET_PROJECTS = [
  'socket-cli',
  'socket-lib',
  'socket-sdk-js',
  'socket-packageurl-js',
  'socket-registry',
]

// Storage paths.
// User-level (cross-repo, persistent)
export const CLAUDE_HOME = path.join(os.homedir(), '.claude')
export const STORAGE_PATHS = {
  cache: path.join(CLAUDE_HOME, 'cache'),
  config: path.join(CLAUDE_HOME, 'config.json'),
  fixMemory: path.join(CLAUDE_HOME, 'fix-memory.db'),
  history: path.join(CLAUDE_HOME, 'history.json'),
  stats: path.join(CLAUDE_HOME, 'stats.json'),
}

// Repo-level (per-project, temporary)
export const REPO_STORAGE = {
  scratch: path.join(claudeDir, 'scratch'),
  session: path.join(claudeDir, 'session.json'),
  snapshots: path.join(claudeDir, 'snapshots'),
}

// Retention periods (milliseconds).
export const RETENTION = {
  // 30 days
  cache: 30 * 24 * 60 * 60 * 1000,
  // 1 day
  sessions: 24 * 60 * 60 * 1000,
  // 7 days
  snapshots: 7 * 24 * 60 * 60 * 1000,
}

// Claude API pricing (USD per token).
// https://www.anthropic.com/pricing
export const PRICING = {
  'claude-sonnet-3-7': {
    // $0.30 per 1M cache read tokens
    cache_read: 0.3 / 1_000_000,
    // $3.75 per 1M cache write tokens
    cache_write: 3.75 / 1_000_000,
    // $3 per 1M input tokens
    input: 3.0 / 1_000_000,
    // $15 per 1M output tokens
    output: 15.0 / 1_000_000,
  },
  'claude-sonnet-4-5': {
    // $0.30 per 1M cache read tokens
    cache_read: 0.3 / 1_000_000,
    // $3.75 per 1M cache write tokens
    cache_write: 3.75 / 1_000_000,
    // $3 per 1M input tokens
    input: 3.0 / 1_000_000,
    // $15 per 1M output tokens
    output: 15.0 / 1_000_000,
  },
}

// Simple inline logger.
export const log = {
  done: msg => {
    process.stdout.write('\r\x1b[K')
    logger.log(`  ${colors.green('✓')} ${msg}`)
  },
  error: msg => logger.log(`${colors.red('✗')} ${msg}`),
  failed: msg => {
    process.stdout.write('\r\x1b[K')
    logger.log(`  ${colors.red('✗')} ${msg}`)
  },
  info: msg => logger.info(msg),
  progress: msg => {
    process.stdout.write('\r\x1b[K')
    logger.progress(msg)
  },
  step: msg => {
    logger.log('')
    logger.log(msg)
  },
  substep: msg => logger.log(`  ${msg}`),
  success: msg => logger.log(`${colors.green('✓')} ${msg}`),
  warn: msg => logger.log(`${colors.yellow('⚠')} ${msg}`),
}
