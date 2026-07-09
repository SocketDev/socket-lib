/**
 * @file Tests for ai/role — the declarative ROLE → (tier, profile)
 *   orchestration. resolveRoleTier + ROLE_POLICY are pure policy and get
 *   exhaustive coverage; spawnForRole's delegation to spawnTierWithFallback is
 *   verified with a mocked spawn layer (the fleet rule: AI calls are mocked in
 *   tests, never spawned).
 */

import { describe, expect, it, vi } from 'vitest'

import { AI_PROFILE } from '../../../src/ai/profiles.mts'
import {
  resolveRoleTier,
  ROLE_POLICY,
  spawnForRole,
} from '../../../src/ai/role.mts'

const { mockSpawnTier } = vi.hoisted(() => ({
  mockSpawnTier: vi.fn(),
}))

vi.mock(import('../../../src/ai/spawn.mts'), () => ({
  spawnTierWithFallback: mockSpawnTier,
}))

const ROLES = [
  'discovery',
  'execution',
  'planning',
  'review',
  'verification',
] as const

describe('ROLE_POLICY', () => {
  it('covers every AiRole with a valid AI_PROFILE key', () => {
    for (const role of ROLES) {
      const policy = ROLE_POLICY[role]
      expect(policy).toBeDefined()
      expect(AI_PROFILE[policy.profile]).toBeDefined()
    }
  })

  it('makes Fable the planning/review brain, escalating to Opus for security', () => {
    expect(ROLE_POLICY.planning.tier).toBe('fable')
    expect(ROLE_POLICY.planning.securityTier).toBe('opus')
    expect(ROLE_POLICY.review.tier).toBe('fable')
    expect(ROLE_POLICY.review.securityTier).toBe('opus')
  })

  it('runs execution + discovery + verification on the sonnet floor with no security escalation', () => {
    for (const role of ['discovery', 'execution', 'verification'] as const) {
      expect(ROLE_POLICY[role].tier).toBe('sonnet')
      expect(ROLE_POLICY[role].securityTier).toBeUndefined()
    }
  })

  it('pairs read-only discovery/planning/review with the read profile and mutating execution/verification with verify', () => {
    expect(ROLE_POLICY.discovery.profile).toBe('read')
    expect(ROLE_POLICY.planning.profile).toBe('read')
    expect(ROLE_POLICY.review.profile).toBe('read')
    expect(ROLE_POLICY.execution.profile).toBe('verify')
    expect(ROLE_POLICY.verification.profile).toBe('verify')
  })
})

describe('resolveRoleTier', () => {
  it('returns the policy tier for each role with no levers', () => {
    expect(resolveRoleTier('discovery')).toBe('sonnet')
    expect(resolveRoleTier('execution')).toBe('sonnet')
    expect(resolveRoleTier('planning')).toBe('fable')
    expect(resolveRoleTier('review')).toBe('fable')
    expect(resolveRoleTier('verification')).toBe('sonnet')
  })

  it('escalates planning + review to opus under security sensitivity', () => {
    expect(resolveRoleTier('planning', { sensitivity: 'security' })).toBe(
      'opus',
    )
    expect(resolveRoleTier('review', { sensitivity: 'security' })).toBe('opus')
  })

  it('leaves roles without a securityTier unchanged under security sensitivity', () => {
    expect(resolveRoleTier('discovery', { sensitivity: 'security' })).toBe(
      'sonnet',
    )
    expect(resolveRoleTier('execution', { sensitivity: 'security' })).toBe(
      'sonnet',
    )
    expect(resolveRoleTier('verification', { sensitivity: 'security' })).toBe(
      'sonnet',
    )
  })

  it('drops mechanical execution to the haiku floor', () => {
    expect(resolveRoleTier('execution', { mechanical: true })).toBe('haiku')
    expect(
      resolveRoleTier('execution', { mechanical: true, sensitivity: 'benign' }),
    ).toBe('haiku')
  })

  it('ignores the mechanical lever for non-execution roles', () => {
    expect(resolveRoleTier('discovery', { mechanical: true })).toBe('sonnet')
    expect(resolveRoleTier('planning', { mechanical: true })).toBe('fable')
    expect(resolveRoleTier('verification', { mechanical: true })).toBe('sonnet')
  })

  it('mechanical execution beats security (execution has no securityTier anyway)', () => {
    expect(
      resolveRoleTier('execution', {
        mechanical: true,
        sensitivity: 'security',
      }),
    ).toBe('haiku')
  })
})

describe('spawnForRole', () => {
  it('delegates to spawnTierWithFallback with the resolved tier and the role profile spread in, never model/effort/agent', async () => {
    mockSpawnTier.mockClear()
    const ctx = { available: new Set(), keyed: new Set() }
    await spawnForRole(
      'planning',
      ctx as never,
      {
        cwd: '/repo',
        prompt: 'plan it',
        sensitivity: 'security',
      } as never,
    )
    expect(mockSpawnTier).toHaveBeenCalledTimes(1)
    const [tier, passedCtx, passedOptions] = mockSpawnTier.mock.calls[0]!
    // security planning → opus
    expect(tier).toBe('opus')
    expect(passedCtx).toBe(ctx)
    // profile (read) is spread in; the caller's fields survive; the
    // tier-owned axes are absent so they can't fight the tier. Capture the
    // expected profile values into locals — a src member-expression must not
    // appear in the matcher position (no-src-import-in-test-expect).
    const { permissionMode: readPermissionMode, tools: readTools } =
      AI_PROFILE.read
    expect(passedOptions.permissionMode).toBe(readPermissionMode)
    expect(passedOptions.tools).toEqual(readTools)
    expect(passedOptions.prompt).toBe('plan it')
    expect(passedOptions.cwd).toBe('/repo')
    expect(passedOptions).not.toHaveProperty('model')
    expect(passedOptions).not.toHaveProperty('effort')
    expect(passedOptions).not.toHaveProperty('agent')
    expect(passedOptions).not.toHaveProperty('sensitivity')
    expect(passedOptions).not.toHaveProperty('mechanical')
  })

  it('routes mechanical execution to the haiku tier with the verify profile', async () => {
    mockSpawnTier.mockClear()
    const ctx = { available: new Set(), keyed: new Set() }
    await spawnForRole(
      'execution',
      ctx as never,
      {
        cwd: '/repo',
        prompt: 'apply',
        mechanical: true,
      } as never,
    )
    const [tier, , passedOptions] = mockSpawnTier.mock.calls[0]!
    expect(tier).toBe('haiku')
    const { permissionMode: verifyPermissionMode } = AI_PROFILE.verify
    expect(passedOptions.permissionMode).toBe(verifyPermissionMode)
  })
})
