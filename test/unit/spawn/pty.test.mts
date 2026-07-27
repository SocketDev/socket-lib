/**
 * @file Unit tests for the zero-dependency PTY runner. `buildPtyInvocation` is
 *   pure, so its per-platform shape is asserted without a PTY. `ptyRun` is
 *   exercised end-to-end against a trivial real command through the system
 *   `script` binary; the suite skips that case when `script` is absent so a
 *   host without it stays green.
 */

import { describe, expect, it } from 'vitest'

import { whichSync } from '../../../src/bin/which'
import { buildPtyInvocation, ptyRun } from '../../../src/process/spawn/pty'

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
