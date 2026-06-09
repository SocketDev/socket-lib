import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  AI_HTTP_PROVIDERS,
  buildChatRequestBody,
  callAiHttpModel,
  resolveAiHttpProvider,
} from '../../../src/ai/http.mts'

describe('resolveAiHttpProvider', () => {
  test('resolves the built-in fireworks + synthetic ids', () => {
    expect(resolveAiHttpProvider('fireworks').baseUrl).toBe(
      'https://api.fireworks.ai/inference/v1',
    )
    expect(resolveAiHttpProvider('synthetic').tokenEnv).toBe(
      'SYNTHETIC_API_KEY',
    )
  })

  test('passes a full provider object through unchanged', () => {
    const custom = {
      baseUrl: 'https://x.example/v1',
      id: 'x',
      tokenEnv: 'X_KEY',
    }
    expect(resolveAiHttpProvider(custom)).toBe(custom)
  })

  test('throws on an unknown provider id, naming the known set', () => {
    expect(() => resolveAiHttpProvider('nope')).toThrow(/Known providers/)
    expect(() => resolveAiHttpProvider('nope')).toThrow(/fireworks/)
  })
})

describe('buildChatRequestBody', () => {
  test('builds a user-only message with the model', () => {
    const body = JSON.parse(
      buildChatRequestBody({
        model: 'm',
        prompt: 'hello',
        provider: 'fireworks',
      }),
    )
    expect(body.model).toBe('m')
    expect(body.messages).toEqual([{ content: 'hello', role: 'user' }])
    expect('reasoning_effort' in body).toBe(false)
  })

  test('prepends a system message when provided', () => {
    const body = JSON.parse(
      buildChatRequestBody({
        model: 'm',
        prompt: 'u',
        provider: 'fireworks',
        system: 's',
      }),
    )
    expect(body.messages).toEqual([
      { content: 's', role: 'system' },
      { content: 'u', role: 'user' },
    ])
  })

  test('maps effort to reasoning_effort only when set', () => {
    const withEffort = JSON.parse(
      buildChatRequestBody({
        effort: 'high',
        model: 'm',
        prompt: 'u',
        provider: 'fireworks',
      }),
    )
    expect(withEffort.reasoning_effort).toBe('high')
  })

  test('includes temperature only when a number', () => {
    const body = JSON.parse(
      buildChatRequestBody({
        model: 'm',
        prompt: 'u',
        provider: 'fireworks',
        temperature: 0.2,
      }),
    )
    expect(body.temperature).toBe(0.2)
  })
})

describe('callAiHttpModel — token hygiene', () => {
  let savedFireworks: string | undefined
  beforeEach(() => {
    savedFireworks = process.env['FIREWORKS_API_KEY']
    delete process.env['FIREWORKS_API_KEY']
  })
  afterEach(() => {
    if (savedFireworks === undefined) {
      delete process.env['FIREWORKS_API_KEY']
    } else {
      process.env['FIREWORKS_API_KEY'] = savedFireworks
    }
  })

  test('throws naming the token env var when it is unset (no network)', async () => {
    await expect(
      callAiHttpModel({
        model: 'accounts/fireworks/models/glm-5p1',
        prompt: 'hi',
        provider: 'fireworks',
      }),
    ).rejects.toThrow(/FIREWORKS_API_KEY/)
  })
})

describe('AI_HTTP_PROVIDERS', () => {
  test('every provider names a distinct token env var', () => {
    const envs = Object.values(AI_HTTP_PROVIDERS).map(p => p.tokenEnv)
    expect(new Set(envs).size).toBe(envs.length)
  })
})
