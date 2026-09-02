/**
 * @file Tests for ai/agent/paths — agentPaths() resolves the per-agent,
 *   per-platform config dir plus Claude's memory dir. Manipulates process.env
 *   so the home and XDG branches are exercised deterministically.
 */

import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { agentPaths } from '../../../../src/ai/agent/paths.mjs'

// Snapshot + restore the env keys the module reads.
const KEYS = ['CODEX_HOME', 'HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'APPDATA']
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (let i = 0, { length } = KEYS; i < length; i += 1) {
    const k = KEYS[i]!
    saved[k] = process.env[k]
    delete process.env[k]
  }
  process.env['HOME'] = '/home/alice'
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

describe('agentPaths', () => {
  it('claude: ~/.claude config; memory keyed by cwd slug', () => {
    const p = agentPaths('claude', {
      cwd: '/Users/<user>/projects/socket-btm',
    })
    expect(p?.configDir).toBe(path.join('/home/alice', '.claude'))
    expect(p?.memoryDir).toBe(
      path.join(
        '/home/alice',
        '.claude',
        'projects',
        '-Users-<user>-projects-socket-btm',
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

  it('every agent reports the agent it was asked about', () => {
    expect(agentPaths('claude')?.agent).toBe('claude')
    expect(agentPaths('codex')?.agent).toBe('codex')
    expect(agentPaths('opencode')?.agent).toBe('opencode')
    expect(agentPaths('gemini')?.agent).toBe('gemini')
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
