/**
 * @file Tests for ai/cost — the tolerant JSON-then-text usage parser. Covers
 *   the happy path for each shape (inline JSON usage object, forward and
 *   reversed key order, text footer) across claude/codex/opencode, the
 *   totalTokens derivation, and the all-undefined unparseable path.
 */

import { describe, expect, it } from 'vitest'

import { parseAgentCost, parseNumber } from '../../../src/ai/cost.mts'

describe('parseNumber', () => {
  it('parses a plain integer string', () => {
    expect(parseNumber('123')).toBe(123)
  })

  it('strips thousands separators', () => {
    expect(parseNumber('1,234')).toBe(1234)
  })

  it('parses a decimal string', () => {
    expect(parseNumber('0.0123')).toBe(0.0123)
  })

  it('returns undefined for a missing capture', () => {
    expect(parseNumber(undefined)).toBeUndefined()
  })

  it('returns undefined for a non-finite result', () => {
    expect(parseNumber('not-a-number')).toBeUndefined()
  })
})

describe('parseAgentCost', () => {
  it('parses an inline JSON usage object (Anthropic key names)', () => {
    const stdout = '{"usage":{"input_tokens":1500,"output_tokens":320}}'
    const cost = parseAgentCost('claude', stdout, '')
    expect(cost.inputTokens).toBe(1500)
    expect(cost.outputTokens).toBe(320)
    expect(cost.totalTokens).toBe(1820)
  })

  it('parses an inline JSON usage object (OpenAI key names, reversed order)', () => {
    const stdout =
      '{"usage":{"completion_tokens":150,"prompt_tokens":800,"total_tokens":950}}'
    const cost = parseAgentCost('codex', stdout, '')
    expect(cost.inputTokens).toBe(800)
    expect(cost.outputTokens).toBe(150)
    expect(cost.totalTokens).toBe(950)
  })

  it('parses a text footer with a cost line and token lines', () => {
    const stdout = [
      'Total cost: $0.0123',
      'input: 1,000 tokens',
      'output: 200 tokens',
    ].join('\n')
    const cost = parseAgentCost('claude', stdout, '')
    expect(cost.costUsd).toBeCloseTo(0.0123)
    expect(cost.inputTokens).toBe(1000)
    expect(cost.outputTokens).toBe(200)
    expect(cost.totalTokens).toBe(1200)
  })

  it('parses a text footer with prompt/completion wording', () => {
    const stdout = 'prompt: 40 tokens\ncompletion: 10 tokens\ncost: $0.5'
    const cost = parseAgentCost('opencode', stdout, '')
    expect(cost.inputTokens).toBe(40)
    expect(cost.outputTokens).toBe(10)
    expect(cost.totalTokens).toBe(50)
    expect(cost.costUsd).toBeCloseTo(0.5)
  })

  it('prefers an explicit total_tokens over the input+output derivation', () => {
    const stdout =
      '{"usage":{"input_tokens":100,"output_tokens":50,"total_tokens":999}}'
    const cost = parseAgentCost('claude', stdout, '')
    expect(cost.totalTokens).toBe(999)
  })

  it('reads stderr when stdout has no usage signal', () => {
    const cost = parseAgentCost(
      'claude',
      'nothing usage-shaped here',
      'Total cost: $2.50',
    )
    expect(cost.costUsd).toBeCloseTo(2.5)
    expect(cost.inputTokens).toBeUndefined()
  })

  it('never throws and returns every field undefined for unparseable text', () => {
    const cost = parseAgentCost('claude', 'the quick brown fox', 'jumped over')
    expect(cost).toStrictEqual({
      costUsd: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    })
  })

  it('returns undefined totalTokens when only one side of input/output is known', () => {
    const cost = parseAgentCost('claude', 'input: 500 tokens', '')
    expect(cost.inputTokens).toBe(500)
    expect(cost.outputTokens).toBeUndefined()
    expect(cost.totalTokens).toBeUndefined()
  })

  it('handles empty stdout and stderr', () => {
    const cost = parseAgentCost('gemini', '', '')
    expect(cost).toStrictEqual({
      costUsd: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    })
  })
})
