/**
 * @file Unit tests for AI coding-agent detection. Tests getAgent()/isAgent(),
 *   which wrap std-env's detectAgent() behind a lazily-memoized value. The
 *   memo is per-module-instance, so each case that needs a different
 *   environment resets modules and dynamic-imports a fresh copy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AGENTS_MODULE = '../../../src/env/agents'

// Claude Code sets this; std-env's detection reads it.
const AGENT_ENV_KEY = 'CLAUDECODE'

// Every agent env var std-env's detection table reads (extracted from its
// dist), so a suite run driven by one of these agents stays isolated.
const LEAKY_AGENT_ENV_KEYS = [
  'AI_AGENT',
  'AUGMENT_AGENT',
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'OPENCODE',
  'REPL_ID',
]

describe('env/agents', () => {
  beforeEach(() => {
    vi.resetModules()
    for (let i = 0, { length } = LEAKY_AGENT_ENV_KEYS; i < length; i += 1) {
      vi.stubEnv(LEAKY_AGENT_ENV_KEYS[i]!, undefined)
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should detect no agent in a clean environment', async () => {
    const { getAgent, isAgent } = await import(AGENTS_MODULE)
    expect(getAgent().name).toBeUndefined()
    expect(isAgent()).toBe(false)
  })

  it('should detect an agent from its environment variable', async () => {
    vi.stubEnv(AGENT_ENV_KEY, '1')
    const { getAgent, isAgent } = await import(AGENTS_MODULE)
    expect(getAgent().name).toBeDefined()
    expect(isAgent()).toBe(true)
  })

  it('should memoize the first detection', async () => {
    vi.stubEnv(AGENT_ENV_KEY, '1')
    const { getAgent, isAgent } = await import(AGENTS_MODULE)
    const first = getAgent()
    // Removing the env var after the first call must not change the answer:
    // the detection is memoized, not re-read.
    vi.stubEnv(AGENT_ENV_KEY, undefined)
    expect(getAgent()).toBe(first)
    expect(isAgent()).toBe(true)
  })
})
