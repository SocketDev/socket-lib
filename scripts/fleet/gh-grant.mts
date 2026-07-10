/**
 * @file Approve a pending workflow-dispatch grant from a human terminal.
 *   `gh-token-hygiene-guard` records a request at
 *   `~/.claude/gh-workflow-grant-request` when a dispatch is denied with the
 *   bypass phrase on record but no way to surface a physical-presence prompt
 *   (agent shells have no TTY; MDM blocks osascript). This script is the
 *   human half of that handshake: it REFUSES to run without a real TTY on
 *   both stdin and stdout — the property agent-driven shells cannot fake —
 *   shows the pending request, and mints the session-bound grant
 *   (`~/.claude/gh-workflow-grant` = `<session_id>\n<unix_ms>`) on an
 *   explicit typed confirmation.
 *
 *   Usage (from your own terminal window, not an agent shell):
 *     node scripts/fleet/gh-grant.mts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
// oxlint-disable-next-line socket/prefer-async-spawn -- one blocking scope probe gates the confirm prompt; nothing runs concurrently.
import { spawnSync } from '@socketsecurity/lib-stable/process/spawn/child'

const logger = getDefaultLogger()

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const REQUEST_FILE = path.join(CLAUDE_DIR, 'gh-workflow-grant-request')
const GRANT_FILE = path.join(CLAUDE_DIR, 'gh-workflow-grant')

// A request older than this is stale — the denial that wrote it is no longer
// the human's immediate context, so approving it would be blind.
const REQUEST_MAX_AGE_MS = 30 * 60 * 1000

const CONFIRM_WORD = 'grant'

function ghHasWorkflowScope(): boolean {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' })
  const out = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`
  return /Token scopes:.*'workflow'/.test(out)
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  return await new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main(): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    logger.fail(
      'gh-grant must run from a real terminal: stdin/stdout is not a TTY. ' +
        'Saw a piped or agent-driven shell; wanted your own terminal window. ' +
        'Fix: open Terminal/iTerm and run `node scripts/fleet/gh-grant.mts` there — ' +
        'the TTY requirement IS the physical-presence check, so it cannot be relaxed.',
    )
    return 1
  }

  if (!existsSync(REQUEST_FILE)) {
    logger.fail(
      `No pending grant request at ${REQUEST_FILE}. ` +
        'A request appears only after a dispatch/elevation is denied with the bypass ' +
        'phrase on record. Fix: have the session retry its dispatch, then run this again.',
    )
    return 1
  }

  const body = readFileSync(REQUEST_FILE, 'utf8')
  const requestLines = body.split('\n')
  const sessionId = requestLines[0]?.trim() ?? ''
  const requestedAtMs = Number(requestLines[1]?.trim() ?? '')
  if (!sessionId || !Number.isFinite(requestedAtMs)) {
    await safeDelete(REQUEST_FILE)
    logger.fail(
      `Malformed grant request at ${REQUEST_FILE} — deleted it. ` +
        'Have the session retry its dispatch to record a fresh request.',
    )
    return 1
  }

  const ageMs = Date.now() - requestedAtMs
  if (ageMs > REQUEST_MAX_AGE_MS) {
    await safeDelete(REQUEST_FILE)
    logger.fail(
      `The pending request is ${Math.round(ageMs / 60_000)} min old (limit ` +
        `${REQUEST_MAX_AGE_MS / 60_000} min) — deleted it as stale. ` +
        'Have the session retry its dispatch, then run this again promptly.',
    )
    return 1
  }

  if (!ghHasWorkflowScope()) {
    logger.fail(
      'The gh token does not carry the `workflow` scope, so a grant would be ' +
        'useless. Fix: run `gh auth refresh -h github.com -s workflow` first, ' +
        'then re-run this script.',
    )
    return 1
  }

  logger.log('Pending workflow-dispatch grant request:')
  logger.substep(`session: ${sessionId}`)
  logger.substep(`age: ${Math.round(ageMs / 1000)}s`)
  logger.log(
    'Approving lets that Claude session run EXACTLY ONE `gh workflow run` ' +
      'dispatch. Only approve if you just saw its denial message.',
  )
  const answer = await ask(`Type "${CONFIRM_WORD}" to approve (anything else aborts): `)
  if (answer !== CONFIRM_WORD) {
    logger.info('Aborted; no grant written.')
    return 1
  }

  mkdirSync(CLAUDE_DIR, { recursive: true })
  writeFileSync(GRANT_FILE, `${sessionId}\n${Date.now()}`, 'utf8')
  await safeDelete(REQUEST_FILE)
  logger.success(
    'Grant minted. The session can now re-run its dispatch (single-use; ' +
      'the guard consumes the grant on the way through).',
  )
  return 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  void (async () => {
    process.exitCode = await main()
  })()
}
