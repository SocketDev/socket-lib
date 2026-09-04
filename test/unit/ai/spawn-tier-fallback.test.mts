/**
 * @file `spawnTierWithFallback`, the runtime complement to the static routing
 *   check. Every case drives the tier's keyless `local` rung through an
 *   injected provider, which is the one candidate kind that reaches a result
 *   without starting an agent CLI. That keeps the fall-over decisions — model
 *   offline, seat quota exhausted, genuine failure on a reachable model —
 *   observable without a network call or an installed engine.
 */

import { describe, expect, it, vi } from 'vitest'

import { spawnTierWithFallback } from '../../../src/ai/spawn.mjs'

import type { LocalAgentProvider } from '../../../src/ai/spawn-local.mjs'
import type { RouteContext } from '../../../src/ai/route.mjs'
import type { SpawnAiAgentOptions } from '../../../src/ai/types.mjs'

// No CLI agent is installed and no provider is keyed, so the only candidate
// left in a chain is its keyless local rung.
function localOnlyContext(): RouteContext {
  return {
    available: new Set(),
    keyed: new Set(),
    localAvailable: true,
  }
}

function options(): Omit<SpawnAiAgentOptions, 'agent' | 'effort' | 'model'> {
  return {
    cwd: '/example/checkout',
    disallow: ['Bash'],
    permissionMode: 'dontAsk',
    prompt: 'summarize the diff',
    tools: ['Read'],
  }
}

// A provider that reports itself reachable and replies with `reply`.
function providerReplying(reply: string): LocalAgentProvider {
  return {
    availability: vi.fn(async () => 'available' as const),
    generate: vi.fn(async () => reply),
  }
}

describe('when the tier has no usable candidate', () => {
  it('names the tier it could not route', async () => {
    const context: RouteContext = {
      available: new Set(),
      keyed: new Set(),
      localAvailable: false,
    }

    await expect(
      spawnTierWithFallback('sonnet', context, options()),
    ).rejects.toThrow(/no usable agent for tier "sonnet"/)
  })
})

describe('when the local rung answers', () => {
  it('returns its reply and reports nothing fell over', async () => {
    const provider = providerReplying('the diff renames two files')

    const outcome = await spawnTierWithFallback(
      'fable',
      localOnlyContext(),
      options(),
      provider,
    )

    expect(outcome.result.exitCode).toBe(0)
    expect(outcome.result.stdout).toBe('the diff renames two files')
    expect(outcome.candidate.engine).toBe('builtin')
    expect(outcome.fellOver).toEqual([])
  })

  it('passes the caller options through to the provider', async () => {
    const provider = providerReplying('ok')

    await spawnTierWithFallback(
      'fable',
      localOnlyContext(),
      options(),
      provider,
    )

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'summarize the diff' }),
    )
  })

  it('keeps a genuine failure rather than trying a weaker model', async () => {
    // A reachable engine that fails is a real failure, so the walk stops here.
    const provider: LocalAgentProvider = {
      availability: vi.fn(async () => 'available' as const),
      generate: vi.fn(async () => {
        throw new Error('the prompt was rejected')
      }),
    }

    const outcome = await spawnTierWithFallback(
      'fable',
      localOnlyContext(),
      options(),
      provider,
    )

    expect(outcome.result.exitCode).not.toBe(0)
    expect(outcome.result.unavailable).toBe(false)
    expect(outcome.fellOver).toEqual([])
  })
})

describe('when every candidate is out of reach', () => {
  it('returns the last attempt with its unavailable flag intact', async () => {
    const provider: LocalAgentProvider = {
      availability: vi.fn(async () => 'unavailable' as const),
      generate: vi.fn(async () => 'never reached'),
    }

    const outcome = await spawnTierWithFallback(
      'fable',
      localOnlyContext(),
      options(),
      provider,
    )

    expect(outcome.result.unavailable).toBe(true)
    expect(outcome.candidate.engine).toBe('builtin')
    // The candidate being reported is not also listed as one that fell over.
    expect(outcome.fellOver).toEqual([])
  })

  it('treats an exhausted seat quota as out of reach too', async () => {
    // Exit zero, but the reply says the account is rate limited, so the model
    // could not actually serve the request.
    const provider = providerReplying('API error: 429 rate limit exceeded')

    const outcome = await spawnTierWithFallback(
      'fable',
      localOnlyContext(),
      options(),
      provider,
    )

    expect(outcome.result.stdout).toContain('rate limit')
    expect(outcome.fellOver).toEqual([])
  })
})
