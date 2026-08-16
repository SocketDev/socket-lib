import { describe, expect, it } from 'vitest'

import {
  installLanguageModelSimulator,
  LanguageModelSimulator,
} from '../../../src/ai/simulator.mts'

import type { Message } from '../../../src/ai/simulator.mts'

describe('LanguageModelSimulator', () => {
  it('reports available', async () => {
    const sim = new LanguageModelSimulator()
    await expect(sim.availability()).resolves.toBe('available')
  })

  it('creates a session that answers with the first matching rule', async () => {
    const sim = new LanguageModelSimulator({
      rules: [
        { response: 'first match', when: text => text.includes('hello') },
        { response: 'fallback', when: () => true },
      ],
    })
    const session = await sim.create()
    const reply = await session.prompt([
      { content: 'hello world', role: 'user' },
    ])
    expect(reply).toBe('first match')
  })

  it('uses the fallback when no rule matches', async () => {
    const sim = new LanguageModelSimulator({
      fallback: 'no match here',
    })
    const session = await sim.create()
    const reply = await session.prompt([{ content: 'unrelated', role: 'user' }])
    expect(reply).toBe('no match here')
  })

  it('promptStreaming yields the same response', async () => {
    const sim = new LanguageModelSimulator({
      rules: [{ response: 'streamed', when: () => true }],
    })
    const session = await sim.create()
    const chunks: string[] = []
    for await (const chunk of session.promptStreaming([
      { content: 'x', role: 'user' },
    ])) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['streamed'])
  })

  it('joins messages by newline for rule matching', async () => {
    const sim = new LanguageModelSimulator({
      rules: [{ response: 'multi', when: text => text.includes('b') }],
    })
    const session = await sim.create()
    const reply = await session.prompt([
      { content: 'a', role: 'user' },
      { content: 'b', role: 'user' },
    ])
    expect(reply).toBe('multi')
  })
})

describe('installLanguageModelSimulator', () => {
  it('sets globalThis.LanguageModel', () => {
    const target = {} as typeof globalThis
    const sim = installLanguageModelSimulator(target)
    expect(
      (target as { LanguageModel?: unknown | undefined }).LanguageModel,
    ).toBe(sim)
  })

  it('returns the simulator instance', () => {
    const sim = installLanguageModelSimulator({})
    expect(sim).toBeInstanceOf(LanguageModelSimulator)
  })
})
