/**
 * @file Pre-built lockdown profiles for spawnAiAgent. Per CLAUDE.md
 *   "Programmatic Claude calls" rule: every spawn must set tools / disallow /
 *   permissionMode (and the helper always sets --print +
 *   --add-dir cwd). `AI_PROFILE` is a capability ladder — each tier permits
 *   everything the tier above it does, plus one more capability. Spread a tier
 *   and override per call (`tools`/`disallow` to tighten further, `model`,
 *   `addDirs`). Choose the LEAST-capable tier that gets the job done:
 *
 *   - `AI_PROFILE.read` — research / scanning. Read + Grep + Glob + WebFetch +
 *     WebSearch. No Edit, no Write, no Bash. Static-analysis skills
 *     (scanning-quality, scanning-security).
 *   - `AI_PROFILE.edit` — in-place edits only. Read + Edit + Grep + Glob. NO
 *     Write (can't create files), NO Bash. Lint autofix / codemods constrained
 *     to existing files.
 *   - `AI_PROFILE.create` — edit AND create files. Adds Write on top of `.edit`.
 *     Still no Bash. Codegen, adding a test, refactors that split modules.
 *   - `AI_PROFILE.verify` — `.create` plus a READ-ONLY Bash allowlist (node /
 *     pnpm test+run / git status·diff·log). Lets an agent author files AND run
 *     the verifier (its own tests, a check script) — but it CANNOT mutate the
 *     repo: no `git add`, no `git commit`, no install. For codegen that must
 *     self-verify without being trusted to land.
 *   - `AI_PROFILE.full` — `.verify` plus the mutating git commands (`git add` /
 *     `git commit`) and `pnpm exec`. Skills that commit, run tests, install
 *     deps. No "wide open" tier exists by design — letting an agent run
 *     arbitrary tools is the lockdown rule's exact failure mode. The ladder is
 *     read ⊂ edit ⊂ create ⊂ verify ⊂ full: each tier's tool set is a superset
 *     of the one above. Bash allowlists are composed from the `BASH_ALLOW`
 *     building blocks below so a caller can assemble a custom tier
 *     (`[...BASH_ALLOW.git, ...BASH_ALLOW.test]`) without forking a profile
 *     literal.
 */

import type { PermissionMode } from './types.mts'

export interface AiProfile {
  readonly allow: readonly string[]
  readonly disallow: readonly string[]
  readonly permissionMode: PermissionMode
  readonly tools: readonly string[]
}

/**
 * Composable Bash-allowlist building blocks. Each group is a frozen list of
 * `Bash(<cmd>:*)` glob entries; the profiles below compose tiers from them, and
 * callers can mix their own (`allow: [...BASH_ALLOW.test, 'Bash(make:*)']`)
 * without rewriting a whole tier's literal.
 *
 * - `gitRead` — non-mutating inspection (`status` / `diff` / `log`).
 * - `gitWrite` — mutating (`add` / `commit`). The bright line between `verify`
 *   (may NOT land) and `full` (may land).
 * - `node` — run a `.mts` / `.js` directly (tests, check scripts, codegen).
 * - `test` — `pnpm test` / `pnpm run <script>` (the verify surface).
 * - `pkgExec` — `pnpm exec` (run a workspace bin); broader, full-tier only.
 */
export const BASH_ALLOW = {
  gitRead: ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)'],
  gitWrite: ['Bash(git add:*)', 'Bash(git commit:*)'],
  node: ['Bash(node:*)'],
  pkgExec: ['Bash(pnpm exec:*)'],
  test: ['Bash(pnpm run:*)', 'Bash(pnpm test:*)'],
} as const satisfies Readonly<Record<string, readonly string[]>>

// The read-only Bash surface shared by `verify` and `full`: run code + tests +
// inspect git, but do not land anything.
const VERIFY_BASH_ALLOW = [
  ...BASH_ALLOW.gitRead,
  ...BASH_ALLOW.node,
  ...BASH_ALLOW.test,
] as const

/**
 * Capability ladder of lockdown profiles, ordered least → most capable. Key
 * order documents the ladder; each tier is a strict superset of the previous
 * tier's tool surface.
 */
export const AI_PROFILE = {
  read: {
    allow: [],
    disallow: ['Agent', 'Bash', 'Edit', 'Write'],
    permissionMode: 'dontAsk',
    tools: ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'],
  },
  // No Write: edits land in existing files, never create new ones.
  edit: {
    allow: [],
    disallow: ['Agent', 'Bash', 'WebFetch', 'WebSearch', 'Write'],
    permissionMode: 'acceptEdits',
    tools: ['Edit', 'Glob', 'Grep', 'Read'],
  },
  // Write added: may create files. Bash still denied.
  create: {
    allow: [],
    disallow: ['Agent', 'Bash', 'WebFetch', 'WebSearch'],
    permissionMode: 'acceptEdits',
    tools: ['Edit', 'Glob', 'Grep', 'Read', 'Write'],
  },
  // `.create` + a READ-ONLY Bash allowlist: run code / tests / inspect git, so
  // the agent can self-verify what it authored — but NO `git add`/`git commit`,
  // so it cannot land. The verify-without-trust-to-commit tier.
  verify: {
    allow: [...VERIFY_BASH_ALLOW],
    disallow: ['Agent', 'WebFetch', 'WebSearch'],
    permissionMode: 'acceptEdits',
    tools: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'],
  },
  // `.verify` + the MUTATING git commands + `pnpm exec`; anything else denied.
  // Composed from the BASH_ALLOW blocks so the surface stays one source.
  full: {
    allow: [
      ...VERIFY_BASH_ALLOW,
      ...BASH_ALLOW.gitWrite,
      ...BASH_ALLOW.pkgExec,
    ],
    disallow: ['Agent', 'WebFetch', 'WebSearch'],
    permissionMode: 'acceptEdits',
    tools: ['Bash', 'Edit', 'Glob', 'Grep', 'Read', 'Write'],
  },
} as const satisfies Readonly<Record<string, AiProfile>>
