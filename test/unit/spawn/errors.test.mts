import { describe, expect, it } from 'vitest'

import { spawn } from '../../../src/process/spawn/child'
import {
  enhanceSpawnError,
  isSpawnError,
  isSpawnExitError,
} from '../../../src/process/spawn/errors'

// A spawn rejection is an Error carrying extra fields. Building fixtures this
// way rather than as bare object literals matters: the guard narrows to a type
// declaring `message` / `stack` / `cmd`, so a plain object that satisfied it
// would hand the caller a value typed as something it is not.
function spawnErr(extra: Record<string, unknown>): Error {
  return Object.assign(new Error('command failed'), extra)
}

describe('spawn/errors — isSpawnError', () => {
  it('returns true for error with code property', () => {
    expect(isSpawnError(spawnErr({ code: 1 }))).toBe(true)
  })

  it('returns true for error with errno property', () => {
    expect(isSpawnError(spawnErr({ errno: -2 }))).toBe(true)
  })

  it('returns true for error with syscall property', () => {
    expect(isSpawnError(spawnErr({ syscall: 'spawn' }))).toBe(true)
  })

  it('returns false for null', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- `throw null` is legal JS, so a catch-site guard must handle it; that is the case under test.
    expect(isSpawnError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSpawnError(undefined)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isSpawnError('string')).toBe(false)
    expect(isSpawnError(123)).toBe(false)
    expect(isSpawnError(true)).toBe(false)
  })

  it('returns false for object without spawn error properties', () => {
    expect(isSpawnError({})).toBe(false)
    expect(isSpawnError({ message: 'error' })).toBe(false)
  })

  // The guard narrows to `SpawnError`, which declares `message`, `stack`,
  // `cmd` and `args`. A plain bag carrying only `code` has none of them, so
  // accepting it handed callers a value typed as something it was not.
  it('rejects a plain object even when it carries spawn-shaped fields', () => {
    expect(isSpawnError({ code: 1 })).toBe(false)
    expect(isSpawnError({ errno: -2 })).toBe(false)
    expect(isSpawnError({ syscall: 'spawn' })).toBe(false)
    expect(isSpawnError({ cmd: 'git', args: [], code: 1 })).toBe(false)
  })

  it('handles error with undefined code', () => {
    expect(isSpawnError(spawnErr({ code: undefined, errno: 1 }))).toBe(true)
  })

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

describe('spawn/errors — isSpawnExitError', () => {
  // The distinction this predicate exists for. `spawn` fails in two shapes and
  // they carry DIFFERENT `code` types: a process that ran and exited non-zero
  // gives a number, a command that could not be launched gives the string
  // 'ENOENT'. Both satisfy isSpawnError, so reading `.code` as a number after
  // that guard alone is wrong for the launch-failure half.
  it('accepts a non-zero exit, whose code is the numeric status', () => {
    expect(isSpawnExitError(spawnErr({ code: 3 }))).toBe(true)
    expect(isSpawnExitError(spawnErr({ code: 0 }))).toBe(true)
  })

  it('REJECTS a launch failure, whose code is a string', () => {
    const enoent = spawnErr({ code: 'ENOENT', syscall: 'spawn' })
    // Still a spawn error…
    expect(isSpawnError(enoent)).toBe(true)
    // …but not one with an exit status, which is the whole point.
    expect(isSpawnExitError(enoent)).toBe(false)
  })

  it('rejects a spawn error carrying no code at all', () => {
    expect(isSpawnExitError(spawnErr({ errno: -2 }))).toBe(false)
    expect(isSpawnExitError(spawnErr({ code: undefined, errno: 1 }))).toBe(
      false,
    )
  })

  it('rejects the things isSpawnError rejects', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- same as above: `throw null` is reachable at a catch site.
    expect(isSpawnExitError(null)).toBe(false)
    expect(isSpawnExitError(undefined)).toBe(false)
    expect(isSpawnExitError(42)).toBe(false)
    expect(isSpawnExitError(new Error('plain'))).toBe(false)
    expect(isSpawnExitError({ code: 1 })).toBe(false)
  })

  // The motivating caller: `git grep` exits 1 for "no match", which is an
  // answer rather than a failure. Distinguishing that from "git could not be
  // launched" is the difference between a correct search and one that silently
  // reports every repo as a match.
  it('separates a real exit 1 from a failure to launch', () => {
    const noMatch = spawnErr({ code: 1 })
    const notFound = spawnErr({ code: 'ENOENT', syscall: 'spawn' })
    const exitCodeOf = (e: unknown) =>
      isSpawnExitError(e) ? e.code : undefined
    expect(exitCodeOf(noMatch)).toBe(1)
    expect(exitCodeOf(notFound)).toBeUndefined()
  })
})

describe('spawn/errors — enhanceSpawnError', () => {
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
    expect(typeof result.stack).toBe('string')
    expect(typeof result.stack).toBe('string')
  })
})

describe('spawn/errors — basic invocation (child integration)', () => {
  it('rejects with an enhanced error when binary does not exist', async () => {
    const result = spawn('/definitely/not/alpha/binary/xyz', [], {
      stdio: 'ignore',
    })
    await expect(result).rejects.toThrow()
  })
})
