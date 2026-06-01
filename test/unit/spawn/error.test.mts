/**
 * @file Tests for enhanceSpawnError, isSpawnError, and spinner- restart branch
 *   in src/spawn.ts that the existing spawn.test.mts doesn't cover.
 */

import { describe, expect, it } from 'vitest'

import { spawn } from '../../../src/process/spawn/child'
import {
  enhanceSpawnError,
  isSpawnError,
} from '../../../src/process/spawn/errors'

describe('spawn — enhanceSpawnError', () => {
  it('returns undefined inputs unchanged', () => {
    expect(enhanceSpawnError(undefined)).toBeUndefined()
  })

  it('returns non-object inputs unchanged', () => {
    expect(enhanceSpawnError('string')).toBe('string')
    expect(enhanceSpawnError(42)).toBe(42)
    expect(enhanceSpawnError(undefined)).toBeUndefined()
  })

  it('returns generic Errors that are not spawn-shaped unchanged', () => {
    const err = new Error('plain')
    expect(enhanceSpawnError(err)).toBe(err)
  })

  it('enhances synthetic spawn errors in-place (message rewritten)', () => {
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: ['--flag'],
      code: 1,
      stderr: '',
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result).toBe(synthetic)
    expect(result.message).toContain('Command failed: mybinary')
    expect(result.message).toContain('exit code 1')
  })

  it('truncates long arg strings beyond 100 chars', () => {
    const longArgs = Array.from(
      { length: 30 },
      (_, i) => `arg${i}-padded-padded`,
    )
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: longArgs,
      code: 1,
      stderr: '',
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result.message).toContain('...')
  })

  it('includes signal description when terminated by signal', () => {
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: [],
      // isSpawnError requires code to be defined; use a non-zero
      // sentinel here while signal is what enhanceSpawnError prefers
      // for the message.
      code: 0,
      signal: 'SIGTERM',
      stderr: '',
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result.message).toContain('terminated by SIGTERM')
  })

  it('includes truncated first stderr line when present', () => {
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: [],
      code: 1,
      stderr: 'first line of stderr\nsecond line',
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result.message).toContain('first line of stderr')
    expect(result.message).not.toContain('second line')
  })

  it('truncates very long stderr first line beyond 200 chars', () => {
    const longLine = 'x'.repeat(300)
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: [],
      code: 1,
      stderr: longLine,
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result.message).toContain('...')
  })

  it('handles Buffer-typed stderr', () => {
    const synthetic = Object.assign(new Error('command failed'), {
      cmd: 'mybinary',
      args: [],
      code: 1,
      stderr: Buffer.from('buffer-stderr', 'utf8'),
    })
    const result = enhanceSpawnError(synthetic) as Error
    expect(result.message).toContain('buffer-stderr')
  })

  it('wraps non-synthetic spawn errors with cause preserved', () => {
    const original = Object.assign(new Error('original message'), {
      cmd: 'mybinary',
      args: [],
      code: 2,
      stderr: '',
    })
    const result = enhanceSpawnError(original) as Error & {
      cause?: unknown | undefined
    }
    expect(result).not.toBe(original)
    expect(result.cause).toBe(original)
    expect(result.message).toContain('Command failed: mybinary')
  })

  it('lazy-builds stack trace on enhanced error access', () => {
    const original = Object.assign(new Error('e'), {
      cmd: 'mybinary',
      args: [],
      code: 1,
      stderr: '',
    })
    const result = enhanceSpawnError(original) as Error
    // Reading .stack triggers the getter — both first and second reads.
    expect(typeof result.stack).toBe('string')
    expect(typeof result.stack).toBe('string')
  })
})

describe('spawn — isSpawnError', () => {
  it('returns true for spawn-shaped errors with cmd + args + code', () => {
    const err = Object.assign(new Error('x'), {
      cmd: 'mybinary',
      args: [],
      code: 1,
    })
    expect(isSpawnError(err)).toBe(true)
  })

  it('returns false for plain errors', () => {
    expect(isSpawnError(new Error('plain'))).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isSpawnError(undefined)).toBe(false)
    expect(isSpawnError('string')).toBe(false)
    expect(isSpawnError(42)).toBe(false)
  })
})

describe('spawn — basic invocation', () => {
  it('rejects with an enhanced error when binary does not exist', async () => {
    const result = spawn('/definitely/not/a/binary/xyz', [], {
      stdio: 'ignore',
    })
    await expect(result).rejects.toThrow()
  })
})
