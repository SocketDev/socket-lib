/**
 * @file Tests for ai/subagent-status — the terminal-status contract a delegated
 *   subagent returns, and the escalation each status maps to.
 */

import { describe, expect, it } from 'vitest'

import {
  escalationFor,
  isSubagentStatus,
  SUBAGENT_STATUSES,
} from '../../../src/ai/subagent-status.mts'

describe('SUBAGENT_STATUSES', () => {
  it('is the four-state vocabulary, sorted', () => {
    expect(SUBAGENT_STATUSES).toStrictEqual([
      'blocked',
      'done',
      'done-with-concerns',
      'needs-context',
    ])
  })
})

describe('escalationFor', () => {
  it('maps each status to its orchestrator action', () => {
    expect(escalationFor('done')).toBe('advance')
    expect(escalationFor('done-with-concerns')).toBe('surface')
    expect(escalationFor('needs-context')).toBe('redispatch')
    expect(escalationFor('blocked')).toBe('escalate')
  })

  it('covers every status (no unmapped state)', () => {
    for (const status of SUBAGENT_STATUSES) {
      expect(() => escalationFor(status)).not.toThrow()
    }
  })

  it('throws on an unknown status rather than guessing', () => {
    // @ts-expect-error — exercising the runtime guard with an off-contract value.
    expect(() => escalationFor('halfway')).toThrow(/unknown subagent status/)
  })
})

describe('isSubagentStatus', () => {
  it('accepts contract members and rejects others', () => {
    expect(isSubagentStatus('blocked')).toBe(true)
    expect(isSubagentStatus('done-with-concerns')).toBe(true)
    expect(isSubagentStatus('finished')).toBe(false)
    expect(isSubagentStatus('')).toBe(false)
  })
})
