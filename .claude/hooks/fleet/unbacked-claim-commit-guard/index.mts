#!/usr/bin/env node
// Claude Code PreToolUse hook — unbacked-claim-commit-guard.
//
// BLOCKS (exit 2) a `git commit` / `git push` when the LAST assistant turn made
// a success self-claim — "tests pass", "the build succeeds", "typechecks", "lint
// passes", "render verified" — that NO Bash command this session backs.
//
// The fleet rule (CLAUDE.md "Judgment & self-evaluation" → "Verify before you
// claim"): never assert a check passed without a tool call this session that ran
// it. The Stop-time `stop-claim-verify-nudge` nudges at turn-end; this is the
// hard half — it stops the unverified claim from LANDING in a commit/push.
//
// DRY: detection (findUnbackedClaims / sessionBashCommands / CLAIM_RULES) is the
// SAME `_shared/unbacked-claims.mts` matcher the Stop reminder uses. One matcher,
// two enforcement points — they never drift.
//
// Bypass: `Allow unbacked-claim bypass` in a recent user turn (for the case
// where the claim is true but verified outside this session, or is fine to land).

import { bashGuard, block, defineHook, runHook } from '../_shared/guard.mts'
import { findInvocation } from '../_shared/shell-command.mts'
import {
  bypassPhrasePresent,
  readLastAssistantText,
} from '../_shared/transcript.mts'
import {
  findUnbackedClaims,
  sessionBashCommands,
} from '../_shared/unbacked-claims.mts'

const BYPASS_PHRASE = 'Allow unbacked-claim bypass'

// Pre-flight: this guard can ONLY block when the command invokes `git commit`
// or `git push` (see isLandingCommand → findInvocation, whose own substring
// gate requires the binary `git` verbatim). The subcommands `commit`/`push`
// are subsumed — they matter only once `git` is present — so the binary name
// is the complete, minimal trigger. The dispatcher skips importing this guard
// when `git` is absent from the payload.
export const triggers: readonly string[] = ['git']

// True when the command lands work — git commit or git push. Pull/fetch/status
// don't land anything, so an unverified claim sitting next to them is harmless.
export function isLandingCommand(command: string): boolean {
  return (
    findInvocation(command, { binary: 'git', subcommand: 'commit' }) ||
    findInvocation(command, { binary: 'git', subcommand: 'push' })
  )
}

export const check = bashGuard((command, payload) => {
  if (!isLandingCommand(command)) {
    return undefined
  }
  const transcriptPath = payload.transcript_path
  const text = readLastAssistantText(transcriptPath)
  if (!text) {
    return undefined
  }
  const unbacked = findUnbackedClaims(text, sessionBashCommands(transcriptPath))
  if (!unbacked.length) {
    return undefined
  }
  if (bypassPhrasePresent(transcriptPath, BYPASS_PHRASE)) {
    return undefined
  }
  const lines = [
    '[unbacked-claim-commit-guard] Blocked: landing a commit/push with an',
    'unverified success claim in this turn:',
    '',
  ]
  for (let i = 0, { length } = unbacked; i < length; i += 1) {
    const u = unbacked[i]!
    lines.push(`  • "${u.label}" — ${u.hint}`)
  }
  lines.push('')
  lines.push('  Run the command that backs the claim (and let its output show)')
  lines.push('  before committing, or qualify the statement. Verify before you')
  lines.push('  claim — and before you land.')
  lines.push('')
  lines.push(`  Bypass: type "${BYPASS_PHRASE}" in a recent message.`)
  return block(lines.join('\n'))
})

export const hook = defineHook({
  check,
  event: 'PreToolUse',
  matcher: ['Bash'],
  triggers,
  type: 'guard',
})
await runHook(hook, import.meta.url)
