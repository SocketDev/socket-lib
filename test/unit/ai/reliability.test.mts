import { describe, expect, it } from 'vitest'

import { generateVerified } from '../../../src/ai/reliability.mts'

import type { TaskResult } from '../../../src/ai/majority.mts'

describe('generateVerified', () => {
  it('returns the first result that passes verify', async () => {
    let calls = 0
    const result = await generateVerified(
      async () => {
        calls += 1
        return { ok: true, data: calls, raw: String(calls) }
      },
      data => data >= 3,
      5,
    )
    expect(result.data).toBe(3)
    expect(calls).toBe(3)
  })

  it('falls back to the last ok result when none verifies', async () => {
    const result = await generateVerified(
      async () => ({ ok: true, data: 1, raw: '1' }),
      () => false,
      2,
    )
    expect(result.ok).toBe(true)
    expect(result.data).toBe(1)
  })

  it('returns the last result when all attempts fail', async () => {
    const result = await generateVerified(
      async () => ({ ok: false, error: 'no', raw: '' }),
      () => true,
      2,
    )
    expect(result.ok).toBe(false)
  })

  it('respects the attempts cap', async () => {
    let calls = 0
    await generateVerified(
      async () => {
        calls += 1
        return { ok: false, error: 'no', raw: '' }
      },
      () => true,
      3,
    )
    expect(calls).toBe(3)
  })

  it('skips failed attempts and uses the next ok one', async () => {
    let calls = 0
    const result = await generateVerified(
      async () => {
        calls += 1
        return calls === 1
          ? { ok: false, error: 'no', raw: '' }
          : { ok: true, data: 'yes', raw: 'yes' }
      },
      d => d === 'yes',
      2,
    )
    expect(result.data).toBe('yes')
  })
})
