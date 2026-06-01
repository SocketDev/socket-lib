/**
 * @file Shared infrastructure for the Claude Code utilities CLI: storage paths,
 *   pricing tables, the inline logger, low-level command runners, the response
 *   cache, and root-cause analysis helpers. Imported by the command modules.
 */

import { spawn } from '@socketsecurity/lib-stable/process/spawn/child'
import crypto from 'node:crypto'
import {
  existsSync,
  promises as fs,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { deleteAsync as del } from 'del'
import colors from 'yoctocolors-cjs'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

const logger = getDefaultLogger()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootPath = path.join(__dirname, '..')
const parentPath = path.join(rootPath, '..')
const claudeDir = path.join(rootPath, '.claude')
const WIN32 = process.platform === 'win32'

// Socket project names.
const SOCKET_PROJECTS = [
  'socket-cli',
  'socket-lib',
  'socket-sdk-js',
  'socket-packageurl-js',
  'socket-registry',
]

// Storage paths.
// User-level (cross-repo, persistent)
const CLAUDE_HOME = path.join(os.homedir(), '.claude')
const STORAGE_PATHS = {
  cache: path.join(CLAUDE_HOME, 'cache'),
  config: path.join(CLAUDE_HOME, 'config.json'),
  fixMemory: path.join(CLAUDE_HOME, 'fix-memory.db'),
  history: path.join(CLAUDE_HOME, 'history.json'),
  stats: path.join(CLAUDE_HOME, 'stats.json'),
}

// Repo-level (per-project, temporary)
const REPO_STORAGE = {
  scratch: path.join(claudeDir, 'scratch'),
  session: path.join(claudeDir, 'session.json'),
  snapshots: path.join(claudeDir, 'snapshots'),
}

// Retention periods (milliseconds).
const RETENTION = {
  // 30 days
  cache: 30 * 24 * 60 * 60 * 1000,
  // 1 day
  sessions: 24 * 60 * 60 * 1000,
  // 7 days
  snapshots: 7 * 24 * 60 * 60 * 1000,
}

// Claude API pricing (USD per token).
// https://www.anthropic.com/pricing
const PRICING = {
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
const log = {
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

/**
 * Proactive pre-commit detection.
 */
export async function runPreCommitScan(claudeCmd) {
  log.step('Running proactive pre-commit scan')

  const staged = await runCommandWithOutput(
    'git',
    ['diff', '--cached', '--name-only'],
    {
      cwd: rootPath,
    },
  )

  if (!staged.stdout.trim()) {
    log.substep('No staged files to scan')
    return { issues: [], safe: true }
  }

  const files = staged.stdout.trim().split('\n')
  log.substep(`Scanning ${files.length} staged file(s)`)

  const diff = await runCommandWithOutput('git', ['diff', '--cached'], {
    cwd: rootPath,
  })

  const prompt = `You are performing a quick pre-commit scan to catch likely CI failures.

**Staged Changes:**
\`\`\`diff
${diff.stdout}
\`\`\`

**Task:** Analyze these changes for potential CI failures.

**Check for:**
- Type errors
- Lint violations (missing semicolons, unused vars, etc.)
- Breaking API changes
- Missing tests for new functionality
- console.log statements
- debugger statements
- .only() or .skip() in tests

**Output Format (JSON):**
{
  "issues": [
    {
      "severity": "high|medium|low",
      "type": "type-error|lint|test|other",
      "description": "Brief description of the issue",
      "file": "path/to/file.ts",
      "confidence": 85
    }
  ],
  "safe": false
}

**Rules:**
- Only report issues with >60% confidence
- Be specific about file and line if possible
- Mark safe=true if no issues found
- Don't report style issues that auto-fix will handle`

  try {
    const result = await runCommandWithOutput(
      claudeCmd,
      [
        'code',
        '--non-interactive',
        '--output-format',
        'text',
        '--prompt',
        prompt,
      ],
      { cwd: rootPath, timeout: 30_000 },
    )

    if (result.exitCode !== 0) {
      log.substep('Scan completed (no issues detected)')
      return { issues: [], safe: true }
    }

    // Parse JSON response.
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { issues: [], safe: true }
    }

    const scan = JSON.parse(jsonMatch[0])
    return scan
  } catch (e) {
    log.warn(`Scan error: ${e.message}`)
    return { issues: [], safe: true }
  }
}

/**
 * Success celebration with stats.
 */
export async function celebrateSuccess(costTracker, stats = {}) {
  const messages = [
    "🎉 CI is green! You're a legend!",
    "✨ All tests passed! Claude's got your back!",
    '🚀 Ship it! CI is happy!',
    '💚 Green as a well-tested cucumber!',
    '🏆 Victory! All checks passed!',
    '⚡ Flawless execution! CI approved!',
  ]

  const message = messages[Math.floor(Math.random() * messages.length)]
  log.success(message)

  // Show session stats.
  if (costTracker) {
    costTracker.showSessionSummary()
  }

  // Show fix details if available.
  if (stats.fixCount > 0) {
    logger.log('')
    logger.log(colors.cyan('📊 Session Stats:'))
    logger.log(`  Fixes applied: ${stats.fixCount}`)
    logger.log(`  Retries: ${stats.retries || 0}`)
  }

  // Update success streak.
  try {
    const streakPath = path.join(CLAUDE_HOME, 'streak.json')
    let streak = { current: 0, best: 0, lastSuccess: undefined }
    if (existsSync(streakPath)) {
      streak = JSON.parse(await fs.readFile(streakPath, 'utf8'))
    }

    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Reset streak if last success was more than 24h ago.
    if (streak.lastSuccess && streak.lastSuccess < oneDayAgo) {
      streak.current = 1
    } else {
      streak.current += 1
    }

    streak.best = Math.max(streak.best, streak.current)
    streak.lastSuccess = now

    await fs.writeFile(streakPath, JSON.stringify(streak, null, 2))

    logger.log('')
    logger.log(colors.cyan('🔥 Success Streak:'))
    logger.log(`  Current: ${streak.current}`)
    logger.log(`  Best: ${streak.best}`)
  } catch {
    // Ignore errors.
  }
}

/**
 * Analyze error to identify root cause and suggest fix strategies.
 */
export async function analyzeRootCause(claudeCmd, error, context = {}) {
  const ctx = { __proto__: null, ...context }
  const errorHash = hashError(error)

  // Check cache first.
  const cachePath = path.join(STORAGE_PATHS.cache, `analysis-${errorHash}.json`)
  try {
    if (existsSync(cachePath)) {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf8'))
      const age = Date.now() - cached.timestamp
      // Cache valid for 1 hour.
      if (age < 60 * 60 * 1000) {
        log.substep(colors.gray('Using cached analysis'))
        return cached.analysis
      }
    }
  } catch {
    // Ignore cache errors.
  }

  // Load error history for learning.
  const history = await loadErrorHistory()
  const similarErrors = findSimilarErrors(errorHash, history)

  log.progress('Analyzing root cause with Claude')

  const prompt = `You are an expert software engineer analyzing a CI/test failure.

**Error Output:**
\`\`\`
${error}
\`\`\`

**Context:**
- Check name: ${ctx.checkName || 'Unknown'}
- Repository: ${ctx.repoName || 'Unknown'}
- Previous attempts: ${ctx.attempts || 0}

${similarErrors.length > 0 ? `**Similar Past Errors:**\n${similarErrors.map(e => `- ${e.description}: ${e.outcome} (${e.strategy})`).join('\n')}\n` : ''}

**Task:** Analyze this error and provide a structured diagnosis.

**Output Format (JSON):**
{
  "rootCause": "Brief description of the actual problem (not symptoms)",
  "confidence": 85,  // 0-100% how certain you are
  "category": "type-error|lint|test-failure|build-error|env-issue|other",
  "isEnvironmental": false,  // true if likely GitHub runner/network/rate-limit issue
  "strategies": [
    {
      "name": "Fix type assertion",
      "probability": 90,  // 0-100% estimated success probability
      "description": "Add type assertion to resolve type mismatch",
      "reasoning": "Error shows TypeScript expecting string but got number"
    },
    {
      "name": "Update import",
      "probability": 60,
      "description": "Update import path or module resolution",
      "reasoning": "Might be module resolution issue"
    }
  ],
  "environmentalFactors": [
    "Check if GitHub runner has sufficient memory",
    "Verify network connectivity for package downloads"
  ],
  "explanation": "Detailed explanation of what's happening and why"
}

**Rules:**
- Be specific about the root cause, not just symptoms
- Rank strategies by success probability (highest first)
- Include 1-3 strategies maximum
- Mark as environmental if it's likely a runner/network/external issue
- Use confidence scores honestly (50-70% = uncertain, 80-95% = confident, 95-100% = very confident)`

  try {
    const result = await runCommandWithOutput(
      claudeCmd,
      [
        'code',
        '--non-interactive',
        '--output-format',
        'text',
        '--prompt',
        prompt,
      ],
      { cwd: rootPath },
    )

    if (result.exitCode !== 0) {
      log.warn('Analysis failed, proceeding without root cause info')
      return undefined
    }

    // Parse JSON response.
    const jsonMatch = result.stdout.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      log.warn('Could not parse analysis, proceeding without root cause info')
      return undefined
    }

    const analysis = JSON.parse(jsonMatch[0])

    // Cache the analysis.
    try {
      await fs.writeFile(
        cachePath,
        JSON.stringify(
          {
            analysis,
            errorHash,
            timestamp: Date.now(),
          },
          null,
          2,
        ),
      )
    } catch {
      // Ignore cache write errors.
    }

    return analysis
  } catch (e) {
    log.warn(`Analysis error: ${e.message}`)
    return undefined
  }
}

/**
 * Load error history from storage.
 */
export async function loadErrorHistory() {
  const historyPath = path.join(CLAUDE_HOME, 'error-history.json')
  try {
    if (existsSync(historyPath)) {
      const data = JSON.parse(await fs.readFile(historyPath, 'utf8'))
      // Only return recent history (last 100 errors).
      return data.errors.slice(-100)
    }
  } catch {
    // Ignore errors.
  }
  return []
}

/**
 * Save error outcome to history for learning.
 */
export async function saveErrorHistory(
  errorHash,
  outcome,
  strategy,
  description,
) {
  const historyPath = path.join(CLAUDE_HOME, 'error-history.json')
  try {
    let data = { errors: [] }
    if (existsSync(historyPath)) {
      data = JSON.parse(await fs.readFile(historyPath, 'utf8'))
    }

    // 'success' | 'failed'
    data.errors.push({
      errorHash,
      outcome,
      strategy,
      description,
      timestamp: Date.now(),
    })

    // Keep only last 200 errors.
    if (data.errors.length > 200) {
      data.errors = data.errors.slice(-200)
    }

    await fs.writeFile(historyPath, JSON.stringify(data, null, 2))
  } catch {
    // Ignore errors.
  }
}

/**
 * Find similar errors from history.
 */
export function findSimilarErrors(errorHash, history) {
  return history
    .filter(e => e.errorHash === errorHash && e.outcome === 'success')
    .slice(-3)
}

/**
 * Display root cause analysis to user.
 */
export function displayAnalysis(analysis) {
  if (!analysis) {
    return
  }

  logger.log('')
  logger.log(colors.cyan('🔍 Root Cause Analysis:'))
  logger.log(
    `  Cause: ${analysis.rootCause} ${colors.gray(`(${analysis.confidence}% confident)`)}`,
  )
  logger.log(`  Category: ${analysis.category}`)

  if (analysis.isEnvironmental) {
    logger.log(
      colors.yellow(
        '\n  ⚠ This appears to be an environmental issue (runner/network/external)',
      ),
    )
    if (analysis.environmentalFactors.length > 0) {
      logger.log('')
      logger.log(colors.yellow('  Factors to check:'))
      for (
        let i = 0, { length } = analysis.environmentalFactors;
        i < length;
        i += 1
      ) {
        const factor = analysis.environmentalFactors[i]!
        logger.log(colors.yellow(`    - ${factor}`))
      }
    }
  }

  if (analysis.strategies.length > 0) {
    logger.log(
      colors.cyan('\n💡 Fix Strategies (ranked by success probability):'),
    )
    for (let i = 0, { length } = analysis.strategies; i < length; i += 1) {
      const strategy = analysis.strategies[i]!
      logger.log(
        `  ${i + 1}. ${colors.bold(strategy.name)} ${colors.gray(`(${strategy.probability}%)`)}`,
      )
      logger.log(`     ${strategy.description}`)
      logger.log(colors.gray(`     ${strategy.reasoning}`))
    }
  }

  if (analysis.explanation) {
    logger.log('')
    logger.log(colors.cyan('📖 Explanation:'))
    logger.log('')
    logger.log(colors.gray(`  ${analysis.explanation}`))
  }
}

export async function runCommand(command, args = [], options = {}) {
  const opts = { __proto__: null, ...options }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: rootPath,
      ...(WIN32 && { shell: true }),
      ...opts,
    })

    child.on('exit', code => {
      resolve(code || 0)
    })

    child.on('error', error => {
      reject(error)
    })
  })
}

export async function runCommandWithOutput(command, args = [], options = {}) {
  const opts = { __proto__: null, ...options }
  const { input, timeout: timeoutMs, ...spawnOpts } = opts

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const child = spawn(command, args, {
      cwd: rootPath,
      ...(WIN32 && { shell: true }),
      ...spawnOpts,
    })

    // Kill the child once the timeout elapses and resolve with a timeout
    // result instead of racing promises (Promise.race leaks the losing
    // promise and its handles).
    const timeoutId = timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill()
          resolve({
            exitCode: 1,
            stdout,
            stderr: stderr || 'Operation timed out',
            timedOut: true,
          })
        }, timeoutMs)
      : undefined

    // Write input to stdin if provided.
    if (input && child.stdin) {
      child.stdin.write(input)
      child.stdin.end()
    }

    if (child.stdout) {
      child.stdout.on('data', data => {
        stdout += data
      })
    }

    if (child.stderr) {
      child.stderr.on('data', data => {
        stderr += data
      })
    }

    child.on('exit', code => {
      if (timedOut) {
        return
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve({ exitCode: code || 0, stdout, stderr })
    })

    child.on('error', error => {
      if (timedOut) {
        return
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      reject(error)
    })
  })
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

/**
 * Create a semantic hash of error output for tracking duplicate errors.
 * Normalizes errors to catch semantically identical issues with different line
 * numbers.
 *
 * @param {string} errorOutput - The error output to hash.
 *
 * @returns {string} A hex hash of the normalized error
 */
export function hashError(errorOutput) {
  // Normalize error for semantic comparison
  const normalized = errorOutput
    .trim()
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^Z\s]*/g, 'TIMESTAMP')
    .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME')
    // Remove line:column numbers (but keep file paths)
    .replace(/:\d+:\d+/g, ':*:*')
    .replace(/line \d+/gi, 'line *')
    .replace(/column \d+/gi, 'column *')
    // Remove specific SHAs and commit hashes
    .replace(/\b[0-9a-f]{7,40}\b/g, 'SHA')
    // Remove absolute file system paths (keep relative paths)
    .replace(/\/[^\s]*?\/([^/\s]+)/g, '$1')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Take first 500 chars (increased from 200 for better matching)
    .slice(0, 500)

  // Use proper cryptographic hashing for consistent results
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16)
}
