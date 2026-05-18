/**
 * @file Pre-built lockdown profiles for spawnAiAgent. Per CLAUDE.md
 *   "Programmatic Claude calls" rule: every spawn must set tools / disallow /
 *   permissionMode (and the helper always sets --no-session-persistence +
 *   --add-dir cwd). These profiles are canonical safe defaults that callers
 *   spread + override per call. Choose by capability:
 *
 *   - `READ_ONLY_PROFILE` — research / scanning. Read + Grep + Glob
 *   - WebFetch + WebSearch. No Edit, no Write, no Bash. Use for static analysis
 *     skills (scanning-quality, scanning-security).
 *   - `EDIT_ONLY_PROFILE` — fix-mode. Read + Edit + Grep + Glob. Bash explicitly
 *     denied. Use for skills that mutate source files but don't run arbitrary
 *     shell (ai-lint-fix, refactor passes).
 *   - `FULL_FIX_PROFILE` — fix-mode WITH Bash. Read + Edit + Write + Grep + Glob
 *   - Bash (allowlisted to git/pnpm/node by default). Use for skills that need to
 *     commit, run tests, install deps. No `WIDE_OPEN_PROFILE` exists by design
 *     — letting an agent run arbitrary tools is the lockdown rule's exact
 *     failure mode.
 */

import type { PermissionMode } from './types.mts'

interface Profile {
  readonly allow: readonly string[]
  readonly disallow: readonly string[]
  readonly permissionMode: PermissionMode
  readonly tools: readonly string[]
}

/**
 * Read-only research / scanning. No mutation.
 */
export const READ_ONLY_PROFILE: Profile = {
  allow: [],
  disallow: ['Bash', 'Edit', 'MultiEdit', 'Write'],
  permissionMode: 'dontAsk',
  tools: ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'],
}

/**
 * Edit-mode without Bash. Mutates source but can't run shell.
 */
export const EDIT_ONLY_PROFILE: Profile = {
  allow: [],
  disallow: ['Bash', 'WebFetch', 'WebSearch'],
  permissionMode: 'acceptEdits',
  tools: ['Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Write'],
}

/**
 * Fix-mode with Bash, allowlisted to git / pnpm / node.
 */
export const FULL_FIX_PROFILE: Profile = {
  allow: [
    'Bash(git status:*)',
    'Bash(git diff:*)',
    'Bash(git log:*)',
    'Bash(git add:*)',
    'Bash(git commit:*)',
    'Bash(node:*)',
    'Bash(pnpm exec:*)',
    'Bash(pnpm run:*)',
    'Bash(pnpm test:*)',
  ],
  disallow: ['WebFetch', 'WebSearch'],
  permissionMode: 'acceptEdits',
  tools: ['Bash', 'Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Write'],
}
