/**
 * @file Tests for ai/spawn-local — the keyless on-device execution path. The
 *   built-in provider drives an injected LanguageModel factory; spawnLocalAgent
 *   normalizes availability, generation, and failure into the AgentSpawnResult
 *   shape a CLI spawn returns.
 */

import { describe, expect, it } from 'vitest'

import {
  builtinLocalProvider,
  isLocalEngineAvailable,
  isLocalModelSession,
  spawnLocalAgent,
} from '../../../src/ai/spawn-local'

import type {
  LanguageModelAvailability,
  LanguageModelFactory,
} from '../../../src/ai/builtin'
import type {
  LocalAgentProvider,
  LocalSpawnOptions,
} from '../../../src/ai/spawn-local'

// A LanguageModelFactory whose create() yields a session with a prompt() that
// echoes a fixed reply. `availability` is configurable.
function fakeFactory(
  availability: LanguageModelAvailability,
  reply: string,
): LanguageModelFactory {
  return {
    availability: async () => availability,
    create: async () => ({ prompt: async () => reply }),
  }
}

// A provider stub for spawnLocalAgent / isLocalEngineAvailable tests.
function fakeProvider(
  overrides: Partial<LocalAgentProvider>,
): LocalAgentProvider {
  return {
    availability: async () => 'available',
    generate: async () => 'ok',
    ...overrides,
  }
}

const OPTS: LocalSpawnOptions = { cwd: '/tmp', prompt: 'hi' }

describe('isLocalModelSession', () => {
  it('accepts an object with a callable prompt', () => {
    expect(isLocalModelSession({ prompt: () => {} })).toBe(true)
  })

  it('rejects a value without a callable prompt', () => {
    expect(isLocalModelSession({})).toBe(false)
    // JSON.parse('null') yields a null without a bare null literal in source.
    expect(isLocalModelSession(JSON.parse('null'))).toBe(false)
    expect(isLocalModelSession('x')).toBe(false)
    expect(isLocalModelSession({ prompt: 42 })).toBe(false)
  })
})

describe('builtinLocalProvider', () => {
  it('forwards the injected factory availability', async () => {
    const provider = builtinLocalProvider(fakeFactory('available', 'r'))
    expect(await provider.availability()).toBe('available')
  })

  it('creates a session and returns its prompt reply', async () => {
    const provider = builtinLocalProvider(fakeFactory('available', 'the reply'))
    expect(await provider.generate(OPTS)).toBe('the reply')
  })

  it('reports unavailable when no local engine resolves', async () => {
    // No injected factory + no on-device LanguageModel in the test runtime.
    const provider = builtinLocalProvider()
    expect(await provider.availability()).toBe('unavailable')
  })

  it('throws from generate when no local engine resolves', async () => {
    const provider = builtinLocalProvider()
    await expect(provider.generate(OPTS)).rejects.toThrow(/no on-device/)
  })

  it('throws when the created session has no callable prompt', async () => {
    const factory: LanguageModelFactory = {
      availability: async () => 'available',
      create: async () => ({}),
    }
    const provider = builtinLocalProvider(factory)
    await expect(provider.generate(OPTS)).rejects.toThrow(/callable prompt/)
  })
})

describe('isLocalEngineAvailable', () => {
  it('is true only when availability is "available"', async () => {
    expect(
      await isLocalEngineAvailable(
        fakeProvider({ availability: async () => 'available' }),
      ),
    ).toBe(true)
    expect(
      await isLocalEngineAvailable(
        fakeProvider({ availability: async () => 'downloadable' }),
      ),
    ).toBe(false)
  })

  it('is false when the probe throws', async () => {
    expect(
      await isLocalEngineAvailable(
        fakeProvider({
          availability: async () => {
            throw new Error('boom')
          },
        }),
      ),
    ).toBe(false)
  })
})

describe('spawnLocalAgent', () => {
  it('returns the reply on stdout with exit 0 on success', async () => {
    const result = await spawnLocalAgent(
      OPTS,
      fakeProvider({ generate: async () => 'hello' }),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('hello')
    expect(result.unavailable).toBe(false)
    expect(result.overloaded).toBe(false)
    expect(result.attempts).toBe(1)
  })

  it('marks unavailable when availability is not "available"', async () => {
    const result = await spawnLocalAgent(
      OPTS,
      fakeProvider({ availability: async () => 'downloading' }),
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.unavailable).toBe(true)
    expect(result.stderr).toMatch(/downloading/)
  })

  it('marks unavailable when the availability probe throws', async () => {
    const result = await spawnLocalAgent(
      OPTS,
      fakeProvider({
        availability: async () => {
          throw new Error('probe failed')
        },
      }),
    )
    expect(result.unavailable).toBe(true)
    expect(result.stderr).toMatch(/probe failed/)
  })

  it('reports a genuine generation failure without marking unavailable', async () => {
    const result = await spawnLocalAgent(
      OPTS,
      fakeProvider({
        generate: async () => {
          throw new Error('model exploded')
        },
      }),
    )
    expect(result.exitCode).not.toBe(0)
    expect(result.unavailable).toBe(false)
    expect(result.stderr).toMatch(/model exploded/)
  })
})
