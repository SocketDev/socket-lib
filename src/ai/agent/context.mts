/**
 * @file The running-agent context contract: the shape `detectAgent()` returns,
 *   and the mapping from the cross-agent `AI_AGENT` env value to an agent
 *   family.
 *   `AI_AGENT` is the one signal every agent family can set, and its value
 *   carries a version token (Claude Code sets `claude-code_<ver>_agent`). The
 *   family lives in the leading token, so the mapping matches a prefix and a
 *   version bump never breaks it.
 *   Reading the environment is `ai/agent/detect`; resolving an agent's
 *   on-disk directories is `ai/agent/paths`.
 */

import type { AiAgentName } from '../types.mjs'

/**
 * The detected running agent + the raw version token from `AI_AGENT`, when
 * present. `agent` is the normalized `AiAgentName`; `raw` is the full env value
 * (e.g. `claude-code_2-1-169_agent`) for callers that want the version.
 */
export interface DetectedAgent {
  readonly agent: AiAgentName
  readonly raw: string | undefined
}

/**
 * Map an `AI_AGENT` value's leading token to an `AiAgentName`.
 *
 * Matches the family prefix rather than the whole value, because the value
 * carries a version (`claude-code_2-1-169_agent`). Returns `undefined` for a
 * value naming no family this library knows.
 */
export function agentFromAiAgentEnv(value: string): AiAgentName | undefined {
  const lower = value.toLowerCase()
  if (lower.startsWith('claude')) {
    return 'claude'
  }
  if (lower.startsWith('codex')) {
    return 'codex'
  }
  if (lower.startsWith('opencode')) {
    return 'opencode'
  }
  if (lower.startsWith('gemini')) {
    return 'gemini'
  }
  return undefined
}
