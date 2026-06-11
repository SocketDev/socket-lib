/**
 * @file Tests for ai/backends — the shared multi-agent CLI registry + role
 *   routing extracted from the reviewing-code skill.
 */

import { describe, expect, it } from 'vitest'

import {
  BACKENDS,
  isBackendName,
  resolveBackendForRole,
} from '../../../src/ai/backends.mts'

import type { BackendName } from '../../../src/ai/backends.mts'

describe('BACKENDS registry', () => {
  it('registers the four known backends', () => {
    expect(Object.keys(BACKENDS).toSorted()).toStrictEqual([
      'claude',
      'codex',
      'kimi',
      'opencode',
    ])
  })

  it('marks only opencode hybrid', () => {
    expect(BACKENDS.claude.hybrid).toBe(false)
    expect(BACKENDS.codex.hybrid).toBe(false)
    expect(BACKENDS.kimi.hybrid).toBe(false)
    expect(BACKENDS.opencode.hybrid).toBe(true)
  })

  it('builds codex argv writing to the out file', () => {
    const run = BACKENDS.codex.run('/tmp/prompt', '/tmp/out')
    expect(run.outMode).toBe('file')
    expect(run.argv).toContain('exec')
    expect(run.argv).toContain('/tmp/out')
  })

  it('builds claude argv emitting to stdout with the lockdown flags', () => {
    const run = BACKENDS.claude.run('/tmp/prompt', '/tmp/out')
    expect(run.outMode).toBe('stdout')
    expect(run.argv).toContain('--permission-mode')
    expect(run.argv).toContain('dontAsk')
  })
})

describe('isBackendName', () => {
  it('accepts known names and rejects others', () => {
    expect(isBackendName('codex')).toBe(true)
    expect(isBackendName('opencode')).toBe(true)
    expect(isBackendName('gpt')).toBe(false)
    expect(isBackendName('')).toBe(false)
  })
})

describe('resolveBackendForRole', () => {
  const order: readonly BackendName[] = ['codex', 'kimi', 'claude']

  it('returns the first installed non-hybrid backend in the order', () => {
    const r = resolveBackendForRole({
      available: new Set<BackendName>(['claude', 'kimi']),
      preferenceOrder: order,
    })
    expect(r).toStrictEqual({ backend: 'kimi', reason: 'preference' })
  })

  it('honors an installed explicit override', () => {
    const r = resolveBackendForRole({
      available: new Set<BackendName>(['claude', 'codex']),
      override: 'claude',
      preferenceOrder: order,
    })
    expect(r).toStrictEqual({ backend: 'claude', reason: 'override' })
  })

  it('selects a hybrid backend ONLY via override, never from the order', () => {
    // opencode in the order but available → still skipped (auto-pick banned).
    const auto = resolveBackendForRole({
      available: new Set<BackendName>(['opencode']),
      preferenceOrder: ['opencode', 'claude'],
    })
    expect(auto).toStrictEqual({ backend: undefined, reason: 'unavailable' })

    // Named explicitly → honored.
    const explicit = resolveBackendForRole({
      available: new Set<BackendName>(['opencode']),
      override: 'opencode',
      preferenceOrder: ['opencode', 'claude'],
    })
    expect(explicit).toStrictEqual({ backend: 'opencode', reason: 'override' })
  })

  it('falls through to the order when the override is not installed, reporting it', () => {
    const r = resolveBackendForRole({
      available: new Set<BackendName>(['claude']),
      override: 'codex',
      preferenceOrder: order,
    })
    expect(r).toStrictEqual({
      backend: 'claude',
      overrideMissing: 'codex',
      reason: 'preference',
    })
  })

  it('returns unavailable when nothing in the order is installed', () => {
    const r = resolveBackendForRole({
      available: new Set<BackendName>(),
      preferenceOrder: order,
    })
    expect(r).toStrictEqual({ backend: undefined, reason: 'unavailable' })
  })
})
