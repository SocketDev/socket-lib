import { describe, expect, it } from 'vitest'

import { majorityResult } from '../../../src/ai/majority.mts'

import type { TaskResult } from '../../../src/ai/majority.mts'

describe('majorityResult', () => {
  it('picks the most frequent key', () => {
    const results: Array<TaskResult<string>> = [
      { ok: true, data: 'a', raw: 'a' },
      { ok: true, data: 'b', raw: 'b' },
      { ok: true, data: 'a', raw: 'a' },
    ]
    const winner = majorityResult(results, d => d)
    expect(winner.data).toBe('a')
  })

  it('breaks ties to the earliest key', () => {
    const results: Array<TaskResult<string>> = [
      { ok: true, data: 'b', raw: 'b' },
      { ok: true, data: 'a', raw: 'a' },
    ]
    const winner = majorityResult(results, d => d)
    expect(winner.data).toBe('b')
  })

  it('returns the last result when no result is ok', () => {
    const results: Array<TaskResult<string>> = [
      { ok: false, error: 'no', raw: '' },
      { ok: false, error: 'still no', raw: '' },
    ]
    const winner = majorityResult(results, d => d)
    expect(winner.ok).toBe(false)
    expect(winner.error).toBe('still no')
  })

  it('returns the last result when results is empty', () => {
    const winner = majorityResult<string>([], d => d)
    expect(winner.ok).toBe(false)
    expect(winner.error).toBe('no samples')
  })

  it('ignores failed samples in the tally', () => {
    const results: Array<TaskResult<string>> = [
      { ok: true, data: 'a', raw: 'a' },
      { ok: false, data: 'b', raw: 'b' },
      { ok: true, data: 'a', raw: 'a' },
    ]
    const winner = majorityResult(results, d => d)
    expect(winner.data).toBe('a')
  })
})
