/**
 * @file Integration proof for the keyless on-device rung of the tier router.
 *   Stitches the two halves of the seam that the unit suites cover separately —
 *   `resolveTier` (route.mts, the static availability gate) and
 *   `spawnTierWithFallback` (spawn.mts, the runtime fall-over) — into one
 *   end-to-end round-trip driven by an INJECTED `LocalAgentProvider`. Scenario:
 *   a machine with NOTHING keyed and NO agent CLI on PATH (`RouteContext.keyed`
 *   and `.available` both empty). The grunt-tier head (Claude) and its CLI
 *   ladder (Codex, opencode) are all unusable, so the only survivor is the
 *   keyless `local` tail rung. `resolveTier` must pick it with reason
 *   `fell-over`, and `spawnTierWithFallback` must drive the injected provider
 *   and hand back a normal `AgentSpawnResult`. The injected provider mirrors
 *   the exact shape odai's `createLocalLanguageModelFactory` produces: a
 *   `LanguageModelFactory` whose session `prompt()` takes a `Message[]` turn
 *   list, wrapped by the string→ `Message[]` adapter a caller writes when
 *   plugging odai into this seam. It is reconstructed here rather than imported
 *   because socket-lib ships `deps:{}` and never depends on odai (the
 *   dependency runs one way, odai → socket-lib); the odai package drives this
 *   identical path in its own integration suite. The `simulator`-style canned
 *   response keeps the completion deterministic — no network, no CLI, no local
 *   model download.
 */

import { resolveTier } from '@socketsecurity/lib/ai/route'
import { spawnTierWithFallback } from '@socketsecurity/lib/ai/spawn'
import { isLocalEngineAvailable } from '@socketsecurity/lib/ai/spawn-local'
import { describe, expect, it } from 'vitest'

import type {
  LanguageModelAvailability,
  LanguageModelFactory,
} from '@socketsecurity/lib/ai/builtin'
import type { RouteContext } from '@socketsecurity/lib/ai/route'
import type {
  LocalAgentProvider,
  LocalSpawnOptions,
} from '@socketsecurity/lib/ai/spawn-local'

interface Message {
  content: string
  role: 'assistant' | 'system' | 'user'
}

// A LanguageModelFactory whose session takes a Message[] turn list, matching
// odai's on-device session shape. The canned reply keeps the round-trip
// deterministic.
function odaiShapedFactory(
  availability: LanguageModelAvailability,
  reply: string,
): LanguageModelFactory {
  return {
    availability: async () => availability,
    create: async () => ({
      prompt: async (messages: Message[]) =>
        // Prove the Message[] turn list actually flows through: echo the reply
        // only when the user turn is present.
        messages.some(m => m.role === 'user') ? reply : '',
    }),
  }
}

// The string→Message[] adapter a caller writes to inject odai's factory into
// socket-lib's LocalAgentProvider seam.
function localProviderOverFactory(
  factory: LanguageModelFactory,
): LocalAgentProvider {
  return {
    availability: () => factory.availability(),
    async generate(options: LocalSpawnOptions): Promise<string> {
      const session = (await factory.create(
        options.model ? { model: options.model } : undefined,
      )) as { prompt(messages: Message[]): Promise<string> }
      return session.prompt([{ content: options.prompt, role: 'user' }])
    },
  }
}

const CANNED = '{"risk":"low","summary":"router reached the local rung"}'

const spawnOptions = {
  cwd: process.cwd(),
  disallow: [] as readonly string[],
  permissionMode: 'dontAsk' as const,
  prompt: 'Summarize the dependency change.',
  tools: [] as readonly string[],
}

async function noKeyNoCliContext(
  provider: LocalAgentProvider,
): Promise<RouteContext> {
  return {
    available: new Set(),
    keyed: new Set(),
    localAvailable: await isLocalEngineAvailable(provider),
  }
}

describe('ai router — keyless local rung end to end', () => {
  it('probes the injected local provider as available', async () => {
    const provider = localProviderOverFactory(
      odaiShapedFactory('available', CANNED),
    )
    const ctx = await noKeyNoCliContext(provider)
    expect(ctx.localAvailable).toBe(true)
  })

  for (const tier of ['haiku', 'fable'] as const) {
    it(`resolveTier("${tier}") falls over to the local candidate`, async () => {
      const provider = localProviderOverFactory(
        odaiShapedFactory('available', CANNED),
      )
      const ctx = await noKeyNoCliContext(provider)
      const resolution = resolveTier(tier, ctx)
      expect(resolution).toBeDefined()
      expect(resolution!.candidate.kind).toBe('local')
      expect(resolution!.candidate.engine).toBe('builtin')
      expect(resolution!.candidate.provider).toBe('local')
      expect(resolution!.reason).toBe('fell-over')
      expect(resolution!.requestedTier).toBe(tier)
    })

    it(`spawnTierWithFallback("${tier}") drives the provider to a completion`, async () => {
      const provider = localProviderOverFactory(
        odaiShapedFactory('available', CANNED),
      )
      const ctx = await noKeyNoCliContext(provider)
      const spawn = await spawnTierWithFallback(
        tier,
        ctx,
        spawnOptions,
        provider,
      )
      expect(spawn.candidate.kind).toBe('local')
      // No CLI candidate was usable, so nothing was fallen over from.
      expect(spawn.fellOver).toHaveLength(0)
      expect(spawn.result.exitCode).toBe(0)
      expect(spawn.result.unavailable).toBe(false)
      expect(spawn.result.overloaded).toBe(false)
      expect(spawn.result.attempts).toBe(1)
      expect(spawn.result.stdout).toBe(CANNED)
    })
  }

  it('a downloadable-but-not-ready local engine is not routed to', async () => {
    // availability !== 'available' means the rung is skipped by the static gate.
    const provider = localProviderOverFactory(
      odaiShapedFactory('downloadable', CANNED),
    )
    const ctx = await noKeyNoCliContext(provider)
    expect(ctx.localAvailable).toBe(false)
    expect(resolveTier('haiku', ctx)).toBeUndefined()
    await expect(
      spawnTierWithFallback('haiku', ctx, spawnOptions, provider),
    ).rejects.toThrow(/no usable agent/)
  })
})
