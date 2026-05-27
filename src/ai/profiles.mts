/**
 * @file Pre-built lockdown profiles for spawnAiAgent. Per CLAUDE.md
 *   "Programmatic Claude calls" rule: every spawn must set tools / disallow /
 *   permissionMode (and the helper always sets --no-session-persistence +
 *   --add-dir cwd). `AI_PROFILE` is a capability ladder — each tier permits
 *   everything the tier above it does, plus one more capability. Spread a tier
 *   and override per call (`tools`/`disallow` to tighten further, `model`,
 *   `addDirs`). Choose the LEAST-capable tier that gets the job done:
 *
 *   - `AI_PROFILE.read` — research / scanning. Read + Grep + Glob + WebFetch +
 *     WebSearch. No Edit, no Write, no Bash. Static-analysis skills
 *     (scanning-quality, scanning-security).
 *   - `AI_PROFILE.edit` — in-place edits only. Read + Edit + Grep + Glob. NO
 *     Write (can't create files), NO MultiEdit, NO Bash. Lint autofix /
 *     codemods constrained to existing files.
 *   - `AI_PROFILE.create` — edit AND create files. Adds MultiEdit + Write on top
 *     of `.edit`. Still no Bash. Codegen, adding a test, refactors that split
 *     modules.
 *   - `AI_PROFILE.full` — `.create` plus Bash, allowlisted to git / pnpm / node.
 *     Skills that commit, run tests, install deps. No "wide open" tier exists
 *     by design — letting an agent run arbitrary tools is the lockdown rule's
 *     exact failure mode. The ladder is read ⊂ edit ⊂ create ⊂ full: each
 *     tier's tool set is a superset of the one above.
 */

import type { PermissionMode } from './types.mts'

export interface AiProfile {
  readonly allow: readonly string[]
  readonly disallow: readonly string[]
  readonly permissionMode: PermissionMode
  readonly tools: readonly string[]
}

/**
 * Capability ladder of lockdown profiles, ordered least → most capable. Key
 * order documents the ladder; each tier is a strict superset of the previous
 * tier's tool surface.
 */
export const AI_PROFILE = {
  read: {
    allow: [],
    disallow: ['Agent', 'Bash', 'Edit', 'MultiEdit', 'Write'],
    permissionMode: 'dontAsk',
    tools: ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'],
  },
  // No Write / MultiEdit: edits land in existing files, never create new ones.
  edit: {
    allow: [],
    disallow: ['Agent', 'Bash', 'MultiEdit', 'WebFetch', 'WebSearch', 'Write'],
    permissionMode: 'acceptEdits',
    tools: ['Edit', 'Glob', 'Grep', 'Read'],
  },
  // MultiEdit + Write added: may create files. Bash still denied.
  create: {
    allow: [],
    disallow: ['Agent', 'Bash', 'WebFetch', 'WebSearch'],
    permissionMode: 'acceptEdits',
    tools: ['Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Write'],
  },
  // Bash allowlisted to git / pnpm / node only; anything else is denied.
  full: {
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
    disallow: ['Agent', 'WebFetch', 'WebSearch'],
    permissionMode: 'acceptEdits',
    tools: ['Bash', 'Edit', 'Glob', 'Grep', 'MultiEdit', 'Read', 'Write'],
  },
} as const satisfies Readonly<Record<string, AiProfile>>
