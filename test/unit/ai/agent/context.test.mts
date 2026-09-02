/**
 * @file Tests for ai/agent/context — agentFromAiAgentEnv() maps an `AI_AGENT`
 *   value's leading token to an agent family, and returns undefined for a
 *   value naming no known family.
 */

import { describe, expect, it } from 'vitest'

import { agentFromAiAgentEnv } from '../../../../src/ai/agent/context.mjs'

describe('agentFromAiAgentEnv', () => {
  it('maps the claude-code family prefix', () => {
    expect(agentFromAiAgentEnv('claude-code_2-1-169_agent')).toBe('claude')
  })

  it('maps codex / opencode / gemini prefixes', () => {
    expect(agentFromAiAgentEnv('codex_1.0_agent')).toBe('codex')
    expect(agentFromAiAgentEnv('opencode-x')).toBe('opencode')
    expect(agentFromAiAgentEnv('gemini-cli')).toBe('gemini')
  })

  it('is case-insensitive', () => {
    expect(agentFromAiAgentEnv('CLAUDE-CODE_2_agent')).toBe('claude')
    expect(agentFromAiAgentEnv('OpenCode')).toBe('opencode')
  })

  it('returns undefined for an unknown family', () => {
    expect(agentFromAiAgentEnv('example-agent_1_agent')).toBeUndefined()
  })

  it('returns undefined for an empty value', () => {
    expect(agentFromAiAgentEnv('')).toBeUndefined()
  })
})
