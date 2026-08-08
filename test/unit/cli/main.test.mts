/**
 * @file Unit tests for the fail-soft CLI entrypoint runner. The logger is
 *   mocked so message-not-stack error surfacing can be asserted; argv and
 *   `process.exitCode` are saved and restored around every test so the
 *   runner's exit-code discipline is observable without leaking into the
 *   vitest worker.
 */

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bareDoubleDashMessage,
  hasBareDoubleDash,
  helpRequest,
  helpText,
  runMain,
  runMainAsync,
} from '../../../src/cli/main'

import type { ScriptMeta } from '../../../src/cli/main'
import type { Logger } from '../../../src/logger/logger'

const logSpy = vi.fn()
const errorSpy = vi.fn()

vi.mock(import('../../../src/logger/default'), () => ({
  getDefaultLogger: () =>
    ({ error: errorSpy, log: logSpy }) as unknown as Logger,
}))

const META: ScriptMeta = {
  describe: 'does one thing well',
  help: 'Usage: pnpm run thing [--dry-run]',
}

let savedArgv: string[]
let savedExitCode: typeof process.exitCode

function setArgv(...args: string[]): void {
  process.argv = ['/usr/bin/node', '/repo/scripts/thing.mts', ...args]
}

beforeEach(() => {
  savedArgv = process.argv
  savedExitCode = process.exitCode
  process.exitCode = undefined
  setArgv()
})

afterEach(() => {
  process.argv = savedArgv
  process.exitCode = savedExitCode
  vi.clearAllMocks()
})

describe('helpRequest', () => {
  it('returns describe for --describe', () => {
    expect(helpRequest(['--describe'])).toBe('describe')
  })

  it('returns help for -h and --help', () => {
    expect(helpRequest(['-h'])).toBe('help')
    expect(helpRequest(['--help'])).toBe('help')
  })

  it('prefers describe when both are present', () => {
    expect(helpRequest(['--help', '--describe'])).toBe('describe')
  })

  it('returns undefined for a plain argv', () => {
    expect(helpRequest(['--dry-run'])).toBeUndefined()
  })
})

describe('helpText', () => {
  it('prints the one-liner alone for describe', () => {
    expect(helpText('describe', META)).toBe('does one thing well')
  })

  it('prints one-liner + blank line + usage for help', () => {
    expect(helpText('help', META)).toBe(
      'does one thing well\n\nUsage: pnpm run thing [--dry-run]',
    )
  })
})

describe('hasBareDoubleDash / bareDoubleDashMessage', () => {
  it('detects a bare --', () => {
    expect(hasBareDoubleDash(['--flag', '--'])).toBe(true)
    expect(hasBareDoubleDash(['--flag'])).toBe(false)
  })

  it('names the script and the fix in the message', () => {
    const msg = bareDoubleDashMessage('thing.mts')
    expect(msg).toContain('the argv for thing.mts')
    expect(msg).toContain('drop the `--`')
  })
})

describe('runMainAsync — exit-code discipline', () => {
  it('sets exitCode from a numeric return', async () => {
    await runMainAsync(() => 3)
    expect(process.exitCode).toBe(3)
  })

  it('defaults an unclaimed success to 0', async () => {
    await runMainAsync(() => undefined)
    expect(process.exitCode).toBe(0)
  })

  it('keeps a code the main() claimed itself', async () => {
    await runMainAsync(() => {
      process.exitCode = 2
    })
    expect(process.exitCode).toBe(2)
  })

  it('awaits an async main and uses its resolved code', async () => {
    await runMainAsync(async () => 7)
    expect(process.exitCode).toBe(7)
  })

  it('logs the message, never the stack, and sets exitCode 1 on throw', async () => {
    await runMainAsync(() => {
      throw new Error('kaboom')
    })
    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]![0] as string
    expect(logged).toContain('kaboom')
    expect(logged).not.toContain('at ')
  })

  it('handles a rejected async main the same way', async () => {
    await runMainAsync(async () => {
      throw new Error('async kaboom')
    })
    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('kaboom'))
  })
})

describe('runMainAsync — meta handling', () => {
  it('answers --describe from the passed meta without running main', async () => {
    setArgv('--describe')
    const main = vi.fn()
    await runMainAsync(main, META)
    expect(main).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith('does one thing well')
    expect(process.exitCode).toBe(0)
  })

  it('answers --help with describe + usage without running main', async () => {
    setArgv('--help')
    const main = vi.fn()
    await runMainAsync(main, META)
    expect(main).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      'does one thing well\n\nUsage: pnpm run thing [--dry-run]',
    )
    expect(process.exitCode).toBe(0)
  })

  it('answers a help request even when argv also carries a bare --', async () => {
    setArgv('--describe', '--')
    const main = vi.fn()
    await runMainAsync(main, META)
    expect(main).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  it('runs main normally when meta is passed but no help was requested', async () => {
    setArgv('--dry-run')
    await runMainAsync(() => 0, META)
    expect(process.exitCode).toBe(0)
    expect(logSpy).not.toHaveBeenCalled()
  })
})

describe('runMainAsync — bare -- refusal', () => {
  it('refuses a bare -- before main runs', async () => {
    setArgv('--dry-run', '--')
    const main = vi.fn()
    await runMainAsync(main)
    expect(main).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('the argv for thing.mts'),
    )
  })
})

describe('runMain', () => {
  it('fires runMainAsync without rethrowing', async () => {
    let settled: (() => void) | undefined
    const done = new Promise<void>(resolve => {
      settled = resolve
    })
    runMain(() => {
      settled!()
      return 5
    })
    await done
    // The fire-and-forget wrapper still applies the exit-code discipline once
    // the async core settles.
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
    expect(process.exitCode).toBe(5)
  })
})
