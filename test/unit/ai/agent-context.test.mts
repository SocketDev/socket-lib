/**
 * @file Tests for ai/agent-context — detectAgent() (which agent is running,
 *   from env) + agentPaths() (per-agent, per-platform config/memory dirs).
 *   Manipulates process.env + mocks platform/home so the cross-platform
 *   branches are exercised deterministically.
 */

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentPaths, detectAgent } from '../../../src/ai/agent-context.mts'

// Snapshot + restore the env keys the module reads.
const KEYS = [
  'AI_AGENT',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'OPENCODE',
  'CODEX_HOME',
  'CODEX_SANDBOX',
  'CODEX_COMPANION_SESSION_ID',
  'HOME',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
  'APPDATA',
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

  it('falls back to CLAUDECODE when AI_AGENT is unset', () => {
    process.env['CLAUDECODE'] = '1'
    expect(detectAgent()?.agent).toBe('claude')
  })

  it('falls back to OPENCODE / codex markers', () => {
    process.env['OPENCODE'] = '1'
    expect(detectAgent()?.agent).toBe('opencode')
    delete process.env['OPENCODE']
    process.env['CODEX_HOME'] = '/x/.codex'
    expect(detectAgent()?.agent).toBe('codex')
  })

  it('does NOT treat the codex-plugin companion var as codex-running', () => {
    // CODEX_COMPANION_SESSION_ID is set even under Claude (the codex plugin),
    // so it must not be a codex signal.
    process.env['CODEX_COMPANION_SESSION_ID'] = 'abc'
    expect(detectAgent()).toBeUndefined()
  })

  it('returns undefined in a plain shell (no agent signal)', () => {
    expect(detectAgent()).toBeUndefined()
  })
})

describe('agentPaths', () => {
  beforeEach(() => {
    process.env['HOME'] = '/home/alice'
  })

  it('claude: ~/.claude config; memory keyed by cwd slug', () => {
    const p = agentPaths('claude', { cwd: '/Users/x/projects/socket-btm' })
    expect(p?.configDir).toBe(path.join('/home/alice', '.claude'))
    expect(p?.memoryDir).toBe(
      path.join(
        '/home/alice',
        '.claude',
        'projects',
        '-Users-x-projects-socket-btm',
        'memory',
      ),
    )
  })

  it('claude: no cwd → memoryDir undefined', () => {
    expect(agentPaths('claude')?.memoryDir).toBeUndefined()
  })

  it('codex: ~/.codex, no memory; CODEX_HOME overrides', () => {
    expect(agentPaths('codex')?.configDir).toBe(
      path.join('/home/alice', '.codex'),
    )
    expect(agentPaths('codex')?.memoryDir).toBeUndefined()
    process.env['CODEX_HOME'] = '/custom/codex'
    expect(agentPaths('codex')?.configDir).toBe('/custom/codex')
  })

  it('opencode: XDG_CONFIG_HOME wins when set', () => {
    process.env['XDG_CONFIG_HOME'] = '/xdg'
    expect(agentPaths('opencode')?.configDir).toBe(
      path.join('/xdg', 'opencode'),
    )
  })

  it('opencode: ~/.config/opencode when no XDG (POSIX)', () => {
    expect(agentPaths('opencode')?.configDir).toBe(
      path.join('/home/alice', '.config', 'opencode'),
    )
    expect(agentPaths('opencode')?.memoryDir).toBeUndefined()
  })

  it('gemini: ~/.gemini, no memory', () => {
    expect(agentPaths('gemini')?.configDir).toBe(
      path.join('/home/alice', '.gemini'),
    )
    expect(agentPaths('gemini')?.memoryDir).toBeUndefined()
  })

  it('USERPROFILE is the home fallback (Windows-style, no HOME)', () => {
    delete process.env['HOME']
    process.env['USERPROFILE'] = 'C:\\Users\\alice'
    expect(agentPaths('claude')?.configDir).toBe(
      path.join('C:\\Users\\alice', '.claude'),
    )
  })

  it('returns undefined when no home is resolvable', () => {
    delete process.env['HOME']
    delete process.env['USERPROFILE']
    expect(agentPaths('claude')).toBeUndefined()
  })
})
