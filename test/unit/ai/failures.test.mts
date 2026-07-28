import { describe, expect, test } from 'vitest'

import {
  isModelUnavailable,
  isOverloaded,
  isQuotaExhausted,
} from '../../../src/ai/failures.mts'

describe.sequential('isOverloaded', () => {
  test('detects "API Error: 529" in stdout', () => {
    expect(isOverloaded('API Error: 529 Overloaded', '')).toBe(true)
  })

  test('detects "Overloaded" in stderr', () => {
    expect(isOverloaded('', 'Server returned: Overloaded')).toBe(true)
  })

  test('detects case-insensitive Overloaded', () => {
    expect(isOverloaded('', 'overloaded')).toBe(true)
    expect(isOverloaded('OVERLOADED', '')).toBe(true)
  })

  test('returns false for unrelated text', () => {
    expect(isOverloaded('all is well', 'nothing to see here')).toBe(false)
  })

  test('returns false on empty strings', () => {
    expect(isOverloaded('', '')).toBe(false)
  })
})

describe.sequential('isQuotaExhausted', () => {
  test('detects an HTTP 429 in stdout or stderr', () => {
    expect(isQuotaExhausted('API Error: 429 Too Many Requests', '')).toBe(true)
    expect(isQuotaExhausted('', '429 Too Many Requests')).toBe(true)
  })

  test('detects rate-limit / quota / usage-limit phrases', () => {
    expect(isQuotaExhausted('rate limit reached', '')).toBe(true)
    expect(isQuotaExhausted('', 'error: rate_limit_error')).toBe(true)
    expect(isQuotaExhausted('quota exceeded for this key', '')).toBe(true)
    expect(isQuotaExhausted('', 'insufficient_quota')).toBe(true)
    expect(isQuotaExhausted('You exceeded your current quota', '')).toBe(true)
    expect(isQuotaExhausted('weekly usage limit hit', '')).toBe(true)
  })

  test('is case-insensitive', () => {
    expect(isQuotaExhausted('API ERROR: 429', '')).toBe(true)
    expect(isQuotaExhausted('RATE LIMIT', '')).toBe(true)
  })

  test('does not treat a 529 overload as quota exhaustion', () => {
    expect(isQuotaExhausted('API Error: 529 Overloaded', '')).toBe(false)
  })

  test('does not fire on an unanchored stray 429', () => {
    expect(isQuotaExhausted('build exited with code 429', '')).toBe(false)
    expect(isQuotaExhausted('listening on port 4290', '')).toBe(false)
  })

  test('returns false for unrelated text and empty strings', () => {
    expect(isQuotaExhausted('all is well', 'nothing here')).toBe(false)
    expect(isQuotaExhausted('', '')).toBe(false)
  })
})

describe.sequential('isModelUnavailable', () => {
  // Real CLI output captured while Fable 5 was down.
  test('detects a model offline ("currently unavailable")', () => {
    expect(
      isModelUnavailable(
        'Claude Fable 5 is currently unavailable. Learn more: https://www.anthropic.com/news/fable-mythos-access',
        '',
      ),
    ).toBe(true)
  })

  // Real CLI output for a gated/absent model (Mythos / no-access).
  test('detects a gated/absent model ("issue with the selected model")', () => {
    expect(
      isModelUnavailable(
        "There's an issue with the selected model (claude-mythos-5). It may not exist or you may not have access to it. Run --model to pick a different model.",
        '',
      ),
    ).toBe(true)
  })

  test('detects the API-shaped forms (model_not_found / 404 / 403)', () => {
    expect(isModelUnavailable('', 'API Error: 404 model_not_found')).toBe(true)
    expect(isModelUnavailable('API Error: 403 permission denied', '')).toBe(
      true,
    )
  })

  // The gist, not a literal string — varied phrasings that mean the same thing.
  // (Wording drifts across CLI versions + providers; claude-code itself emits
  // several of these.)
  test('detects varied phrasings of the same condition', () => {
    for (const msg of [
      'The model is temporarily unavailable, try again later.',
      "Model 'claude-opus-9' not found.",
      'Error: unknown model claude-foo',
      'This model is unavailable in your region.',
      "You don't have access to claude-fable-5.",
      'Access denied for the requested model.',
      'invalid_request_error: the model does not exist',
    ]) {
      expect(isModelUnavailable(msg, ''), msg).toBe(true)
    }
  })

  test('does NOT fire on an overload (that retries, not falls over)', () => {
    expect(isModelUnavailable('API Error: 529 Overloaded', '')).toBe(false)
  })

  test('does NOT fire on genuine work output that merely says "not found"', () => {
    // A bare not-found unrelated to a model must not trigger a fall-over.
    expect(isModelUnavailable('Error: file config.json not found', '')).toBe(
      false,
    )
    expect(isModelUnavailable('test failed: expected 3, got 4', '')).toBe(false)
    expect(isModelUnavailable('Cannot find module ./foo', '')).toBe(false)
    expect(isModelUnavailable('', '')).toBe(false)
  })
})
