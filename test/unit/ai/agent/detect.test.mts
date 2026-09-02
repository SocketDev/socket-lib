/**
 * @file Tests for ai/agent/detect — detectAgent() reads which agent is running
 *   from the environment: `AI_AGENT` first, tool-specific markers as the
 *   fallback. Manipulates process.env so each branch is deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { detectAgent } from '../../../../src/ai/agent/detect.mjs'

// Snapshot + restore the env keys the module reads.
const KEYS = [
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'OPENCODE',
  'OPENCODE_TERMINAL',
  'CODEX_HOME',
  'CODEX_SANDBOX',
  'CODEX_COMPANION_SESSION_ID',
]
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (let i = 0, { length } = KEYS; i < length; i += 1) {
    const k = KEYS[i]!
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (let i = 0, { length } = KEYS; i < length; i += 1) {
    const k = KEYS[i]!
    if (saved[k] === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = saved[k]
    }
  }
  vi.restoreAllMocks()
})

describe('detectAgent', () => {
  it('reads AI_AGENT family prefix (claude-code → claude)', () => {
    process.env['AI_AGENT'] = 'claude-code_2-1-169_agent'
    const d = detectAgent()
    expect(d?.agent).toBe('claude')
    expect(d?.raw).toBe('claude-code_2-1-169_agent')
  })

  it('maps codex / opencode / gemini AI_AGENT prefixes', () => {
    process.env['AI_AGENT'] = 'codex_1.0_agent'
    expect(detectAgent()?.agent).toBe('codex')
    process.env['AI_AGENT'] = 'opencode-x'
    expect(detectAgent()?.agent).toBe('opencode')
    process.env['AI_AGENT'] = 'gemini-cli'
    expect(detectAgent()?.agent).toBe('gemini')
  })

  it('falls through to the markers when AI_AGENT names no known family', () => {
    process.env['AI_AGENT'] = 'example-agent_1_agent'
    process.env['CLAUDECODE'] = '1'
    expect(detectAgent()?.agent).toBe('claude')
  })

  it('falls back to CLAUDECODE when AI_AGENT is unset', () => {
    process.env['CLAUDECODE'] = '1'
    expect(detectAgent()?.agent).toBe('claude')
  })

  it('falls back to CLAUDE_CODE_ENTRYPOINT', () => {
    process.env['CLAUDE_CODE_ENTRYPOINT'] = 'cli'
    expect(detectAgent()?.agent).toBe('claude')
  })

  it('falls back to OPENCODE_TERMINAL, the var a real OpenCode shell carries', () => {
    process.env['OPENCODE_TERMINAL'] = 'true'
    expect(detectAgent()?.agent).toBe('opencode')
  })

  it('falls back to OPENCODE / codex markers', () => {
    process.env['OPENCODE'] = '1'
    expect(detectAgent()?.agent).toBe('opencode')
    delete process.env['OPENCODE']
    process.env['CODEX_HOME'] = '/example/.codex'
    expect(detectAgent()?.agent).toBe('codex')
  })

  it('falls back to CODEX_SANDBOX', () => {
    process.env['CODEX_SANDBOX'] = 'seatbelt'
    expect(detectAgent()?.agent).toBe('codex')
  })

  it('does NOT treat the codex-plugin companion var as codex-running', () => {
    // CODEX_COMPANION_SESSION_ID is set even under Claude by the codex
    // plugin, so it must not be a codex signal.
    process.env['CODEX_COMPANION_SESSION_ID'] = 'abc'
    expect(detectAgent()).toBeUndefined()
  })

  it('returns undefined in a plain shell (no agent signal)', () => {
    expect(detectAgent()).toBeUndefined()
  })
})
