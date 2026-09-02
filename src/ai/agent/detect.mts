/**
 * @file Which AI agent is invoking this process, read from the environment the
 *   running agent injects.
 *   The answer comes from env, never from a stdin payload: a Claude Code hook
 *   gets `{tool_name,…}` on stdin but no agent id, and Codex/OpenCode use
 *   entirely different invocation contracts. The cross-agent signal is
 *   `AI_AGENT`; tool-specific markers are the fallback.
 *   The complement is `ai/discover`, which answers which agents are INSTALLED
 *   on PATH. This answers which one is DRIVING.
 */

import { agentFromAiAgentEnv } from './context.mjs'
import { getEnvValue } from '../../env/rewire.mjs'

import type { DetectedAgent } from './context.mjs'

/**
 * Detect which AI agent is invoking the current process, from the environment.
 *
 * Resolution order:
 *
 * 1. `AI_AGENT` — the cross-agent signal, which Claude Code sets. Its leading
 *    token names the family.
 * 2. Tool-specific markers as a fallback: `CLAUDECODE=1` / `CLAUDE_CODE_*` →
 *    claude; `OPENCODE_TERMINAL` / `OPENCODE` → opencode; `CODEX_*` → codex.
 *
 * Returns `undefined` when no agent signal is present (a plain shell, CI, a
 * non-agent subprocess) — callers should treat that as "agent-agnostic", not an
 * error.
 *
 * Note: a hook receives NO agent id in its stdin payload; this env read is the
 * only reliable signal. Different agents also invoke hooks differently (Claude:
 * stdin JSON; Codex: its own hooks; OpenCode: plugin callbacks), so a
 * `.claude/hooks/` script is fundamentally Claude-invoked — `detectAgent()` is
 * most useful for scripts/skills that want to branch on the active agent, or
 * when an agent delegates to another.
 *
 * @example
 *   const detected = detectAgent()
 *   if (detected?.agent === 'claude') { ... }
 */
export function detectAgent(): DetectedAgent | undefined {
  const aiAgent = getEnvValue('AI_AGENT')
  if (aiAgent) {
    const agent = agentFromAiAgentEnv(aiAgent)
    if (agent) {
      return { agent, raw: aiAgent }
    }
  }
  // Fallbacks: tool-specific env markers.
  if (getEnvValue('CLAUDECODE') || getEnvValue('CLAUDE_CODE_ENTRYPOINT')) {
    return { agent: 'claude', raw: aiAgent }
  }
  // OPENCODE_TERMINAL is what an OpenCode-spawned shell actually carries;
  // OPENCODE is accepted too, for a version that starts setting it.
  if (getEnvValue('OPENCODE_TERMINAL') || getEnvValue('OPENCODE')) {
    return { agent: 'opencode', raw: aiAgent }
  }
  // Codex sets CODEX_HOME / CODEX_* in a real run. The codex-plugin companion
  // var (CODEX_COMPANION_SESSION_ID) is set even under Claude, so it is NOT a
  // codex-is-running signal and is excluded here.
  if (getEnvValue('CODEX_SANDBOX') || getEnvValue('CODEX_HOME')) {
    return { agent: 'codex', raw: aiAgent }
  }
  return undefined
}
