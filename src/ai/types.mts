/**
 * @file Shared types for the locked-down AI agent surface. The fleet runs
 *   Claude / Codex / OpenCode / Gemini through CLI subprocesses, never via SDK
 *   calls. These types model the cross- agent contract: a permission mode, a
 *   tool allowlist, a tool denylist, a prompt, a working directory. Per-agent
 *   flag translation lives in `spawn.ts` — callers pass the uniform
 *   `SpawnAiAgentOptions` and the helper produces the right CLI args for the
 *   chosen agent.
 */

/**
 * The set of AI agents the helper can drive. Each must be installed as a CLI on
 * PATH; discovery happens via `discoverAiAgents()`.
 */
export type AiAgentName = 'claude' | 'codex' | 'gemini' | 'opencode'

/**
 * Permission mode passed to the agent's CLI. The fleet rule (CLAUDE.md
 * "Programmatic Claude calls") requires every headless call to set one of these
 * explicitly — never the agent's default.
 *
 * - `acceptEdits` — Edit/Write proceed without prompting. Required for fix-mode
 *   skills; `dontAsk` would DENY rather than auto-accept.
 * - `dontAsk` — read-only / no-mutation use. AskUserQuestion calls are
 *   suppressed.
 * - `plan` — research / proposal mode. The agent can read but cannot write or run
 *   tools that mutate state.
 */
export type PermissionMode = 'acceptEdits' | 'dontAsk' | 'plan'

/**
 * Result of an agent spawn. Consumers should inspect `exitCode` before using
 * `stdout` — non-zero usually means the agent's CLI itself rejected, not just
 * that the prompt failed.
 */
export interface AgentSpawnResult {
  readonly attempts: number
  readonly durationMs: number
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

/**
 * Inputs to a single agent spawn.
 *
 * Required: `prompt`, `cwd`, `tools`, `disallow`, `permissionMode`.
 *
 * Pre-built profiles in `profiles.ts` cover the common shapes (the `AI_PROFILE`
 * capability ladder) — callers spread a tier and override per-call (model,
 * timeout, addDirs).
 *
 * Why the lockdown fields are required (not defaulted to a permissive shape):
 * the CLAUDE.md rule says "all four lockdown flags MUST be set on every spawn."
 * Making them required at the type level is the type-system version of that
 * rule.
 */
export interface SpawnAiAgentOptions {
  /**
   * Optional explicit agent. Defaults to claude when discovered.
   */
  readonly agent?: AiAgentName
  /**
   * Allow-list extras (Bash glob patterns, MCP tools, etc.).
   */
  readonly allow?: readonly string[]
  /**
   * Extra dirs the agent can read (e.g. parent of cwd for monorepo).
   */
  readonly addDirs?: readonly string[]
  /**
   * Tool denylist — required to enforce the lockdown.
   */
  readonly disallow: readonly string[]
  /**
   * Override the agent's flag list (rare; for one-off advanced cases).
   */
  readonly extraArgs?: readonly string[]
  /**
   * Model name override; agent default if absent.
   */
  readonly model?: string
  /**
   * Permission mode — see PermissionMode docstring.
   */
  readonly permissionMode: PermissionMode
  /**
   * The prompt sent on stdin.
   */
  readonly prompt: string
  /**
   * Repository / working directory for the agent.
   */
  readonly cwd: string
  /**
   * Per-call timeout (ms). Caller should set for predictable bounds.
   */
  readonly timeoutMs?: number
  /**
   * Tool allowlist. Required to enforce the lockdown.
   */
  readonly tools: readonly string[]
}

/**
 * The cwd-aware "is this binary on PATH?" snapshot. Each entry is the absolute
 * path resolved by `which`; missing agents are absent from the map (not
 * present-with-undefined).
 */
export type DiscoveredAgents = Readonly<Partial<Record<AiAgentName, string>>>

/**
 * Cleanup policy for `spawnAiAgentsInWorktrees`. Default 'always'.
 *
 * - `always` — remove the worktree after the per-item function returns,
 *   regardless of success/failure or whether changes were committed. Matches
 *   the "leave no trace" expectation.
 * - `never` — never auto-remove. Caller (or human inspector) cleans up. Useful
 *   for debugging.
 * - `on-empty` — remove only if the worktree had no changes (committed or
 *   staged). Preserves evidence on failure.
 */
export type WorktreeCleanup = 'always' | 'never' | 'on-empty'
