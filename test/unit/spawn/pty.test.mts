/**
 * @file Unit tests for the zero-dependency PTY runner. `buildPtyInvocation` is
 *   pure, so its per-platform shape is asserted without a PTY. `ptyRun` is
 *   exercised end-to-end against a trivial real command through the system
 *   `script` binary; the suite skips that case when `script` is absent so a
 *   host without it stays green.
 */

import { closeSync, openSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { whichSync } from '../../../src/exe/path/which.mjs'
import { safeDeleteSync } from '../../../src/fs/safe.mjs'
import {
  buildPtyInvocation,
  NON_INTERACTIVE_RENDER_ENV,
  ptyRun,
  ptyRunPumped,
  stdoutIsFileBacked,
} from '../../../src/process/spawn/pty.mjs'

import { itUnixOnly } from '../util/skip-helpers.mjs'

const HAS_SCRIPT = whichSync('script') !== null
// The end-to-end case allocates a REAL PTY through the system `script`
// binary. PTY allocation is unreliable under the parallel coverage
// harness (and macOS `script` masks the child's own failures), so the
// spawn case runs only outside coverage — the raw-terminal exemption.
const UNDER_COVERAGE = Boolean(
  process.env['NODE_V8_COVERAGE'] || process.env['FLEET_CHILD_V8_COVERAGE_DIR'],
)

describe('buildPtyInvocation', () => {
  it('returns undefined on win32', () => {
    expect(buildPtyInvocation('win32', 'node', ['--version'])).toBe(undefined)
  })

  it('uses the trailing-args form on darwin', () => {
    expect(buildPtyInvocation('darwin', 'node', ['--version'])).toStrictEqual({
      command: 'script',
      args: ['-q', '/dev/null', 'node', '--version'],
    })
  })

  it('uses the trailing-args form on the BSDs', () => {
    expect(buildPtyInvocation('freebsd', 'node', ['--version'])).toStrictEqual({
      command: 'script',
      args: ['-q', '/dev/null', 'node', '--version'],
    })
  })

  it('uses the -c command-string form on linux', () => {
    expect(buildPtyInvocation('linux', 'node', ['--version'])).toStrictEqual({
      command: 'script',
      args: ['-q', '-c', "'node' '--version'", '/dev/null'],
    })
  })

  it('single-quote-escapes tokens in the linux command string', () => {
    const invocation = buildPtyInvocation('linux', 'echo', ["it's"])
    expect(invocation?.args[2]).toBe("'echo' 'it'\\''s'")
  })
})

describe('ptyRun', () => {
  it.skipIf(!HAS_SCRIPT || UNDER_COVERAGE)(
    'streams stdout and resolves exit code 0 for `node --version`',
    async () => {
      const chunks: string[] = []
      const result = await ptyRun(process.execPath, ['--version'], {
        onStdout: chunk => chunks.push(chunk),
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/)
      expect(chunks.join('')).toMatch(/v\d+\.\d+\.\d+/)
    },
  )

  it('rejects on a platform without a PTY', async () => {
    await expect(
      ptyRun('node', ['--version'], { platform: 'win32' }),
    ).rejects.toThrow(/no PTY available/)
  })
})

describe('NON_INTERACTIVE_RENDER_ENV', () => {
  it('sets exactly NO_COLOR', () => {
    expect(NON_INTERACTIVE_RENDER_ENV).toStrictEqual({ NO_COLOR: '1' })
  })

  it('avoids the two knobs that break PTY interactivity', () => {
    // CI=1 makes tools refuse interactive flows; TERM=dumb zeroes
    // process.stdout.columns under script(1). Neither may creep in.
    expect(NON_INTERACTIVE_RENDER_ENV['CI']).toBe(undefined)
    expect(NON_INTERACTIVE_RENDER_ENV['TERM']).toBe(undefined)
  })
})

describe('stdoutIsFileBacked', () => {
  it('reports true for a regular file fd', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'pty-file-backed-'))
    const filePath = path.join(tmp, 'out.log')
    writeFileSync(filePath, 'captured\n')
    const fd = openSync(filePath, 'r')
    try {
      expect(stdoutIsFileBacked(fd)).toBe(true)
    } finally {
      closeSync(fd)
      safeDeleteSync(tmp)
    }
  })

  itUnixOnly(
    'reports false for a character device (not a regular file)',
    () => {
      const fd = openSync(os.devNull, 'r')
      try {
        expect(stdoutIsFileBacked(fd)).toBe(false)
      } finally {
        closeSync(fd)
      }
    },
  )

  it('reports false rather than throwing on an invalid fd', () => {
    // fd 2147483646 is never open; fstat throws EBADF and the helper
    // answers false instead of failing the caller.
    expect(stdoutIsFileBacked(2_147_483_646)).toBe(false)
  })

  it('answers a boolean for the real stdout fd', () => {
    // Under a test runner fd 1 may be a pipe, a tty, or a harness capture
    // file — any of them must produce a clean boolean, never a throw.
    expect(typeof stdoutIsFileBacked()).toBe('boolean')
  })
})

describe('ptyRunPumped', () => {
  it.skipIf(!HAS_SCRIPT || UNDER_COVERAGE)(
    'forwards chunks to the parent streams AND to caller callbacks',
    async () => {
      const chunks: string[] = []
      const result = await ptyRunPumped(process.execPath, ['--version'], {
        onStdout: chunk => chunks.push(chunk),
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/)
      // The caller's own callback still observed every chunk after the pump.
      expect(chunks.join('')).toMatch(/v\d+\.\d+\.\d+/)
    },
  )

  it('rejects on a platform without a PTY, same as ptyRun', async () => {
    await expect(
      ptyRunPumped('node', ['--version'], { platform: 'win32' }),
    ).rejects.toThrow(/no PTY available/)
  })
})
