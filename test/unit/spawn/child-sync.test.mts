/**
 * @file Unit tests for synchronous process spawn utilities. Tests spawnSync()
 *   synchronous process execution: exit status, output capture, stdio handling,
 *   ANSI stripping, and error cases. Companion to spawn.test.mts, which covers
 *   the async spawn() path. Used by Socket tools for git operations, npm
 *   commands, and external process execution.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { WIN32 } from '../../../src/constants/platform'
import { spawnSync } from '../../../src/process/spawn/child'

import { itUnixOnly, itWindowsOnly } from '../util/skip-helpers'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

describe('spawnSync', () => {
  it('accepts a platform-scaled localTimeout', () => {
    const result = spawnSync('echo', ['ok'], { localTimeout: 5000 })
    expect(result.status).toBe(0)
    expect(String(result.stdout)).toContain('ok')
  })

  it('rejects timeout with localTimeout', () => {
    expect(() =>
      spawnSync('echo', ['x'], { localTimeout: 5000, timeout: 1000 }),
    ).toThrow(/not both/)
  })

  it('should spawn a simple command synchronously', () => {
    const result = spawnSync('echo', ['hello'])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('hello')
  })

  it('should spawn command without args', () => {
    const result = spawnSync('pwd')
    expect(result.status).toBe(0)
    expect(typeof result.stdout).toBe('string')
  })

  it('should capture stdout', () => {
    const result = spawnSync('echo', ['test output'])
    expect(result.stdout).toContain('test output')
  })

  it('should handle commands with multiple args', () => {
    const result = spawnSync('echo', ['arg1', 'arg2', 'arg3'])
    expect(result.status).toBe(0)
  })

  it('should handle empty args array', () => {
    const result = spawnSync('pwd', [])
    expect(result.status).toBe(0)
  })

  it('should handle options with cwd', () => {
    const result = spawnSync('pwd', [], {
      cwd: process.cwd(),
    })
    expect(result.status).toBe(0)
  })

  it('should handle options with env', () => {
    // Test that custom env is passed to spawned process
    const result = spawnSync(
      'node',
      ['-e', 'console.log(process.env.TEST_VAR)'],
      {
        env: { ...process.env, TEST_VAR: 'test-value' },
      },
    )
    expect(result.status).toBe(0)
    // Default stdioString: true → stdout is typed as string.
    expect(result.stdout.trim()).toBe('test-value')
  })

  it('should handle stdioString: true (default)', () => {
    const result = spawnSync('echo', ['hello'], {
      stdioString: true,
    })
    expect(typeof result.stdout).toBe('string')
    expect(typeof result.stderr).toBe('string')
  })

  it('should handle stdioString: false', () => {
    const result = spawnSync('echo', ['hello'], {
      stdioString: false,
    })
    expect(Buffer.isBuffer(result.stdout)).toBe(true)
    expect(Buffer.isBuffer(result.stderr)).toBe(true)
  })

  it('should strip ANSI codes by default', () => {
    const result = spawnSync(
      'node',
      ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
      {},
    )
    expect(result.status).toBe(0)
    // ANSI codes should be stripped (default behavior); stdout is string.
    expect(result.stdout).not.toContain('\x1b[31m')
    expect(result.stdout).toContain('red')
  })

  it('should not strip ANSI codes when stripAnsi: false', () => {
    const result = spawnSync(
      'node',
      ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
      {
        stripAnsi: false,
      },
    )
    expect(result.status).toBe(0)
    // ANSI codes should NOT be stripped; stdout is string.
    expect(result.stdout).toContain('\x1b[31m')
  })

  it('should handle readonly args array', () => {
    const args = ['hello'] as const
    const result = spawnSync('echo', args)
    expect(result.status).toBe(0)
  })

  it('should return non-zero status for failed command', () => {
    const result = spawnSync('sh', ['-c', 'exit 1'])
    expect(result.status).toBe(1)
  })

  it('should capture stderr', () => {
    const result = spawnSync('sh', ['-c', 'echo error >&2'])
    expect(result.stderr).toContain('error')
  })

  it('should have output array', () => {
    const result = spawnSync('echo', ['hello'])
    expect(Array.isArray(result.output)).toBe(true)
  })

  // Fleet pattern: pass `shell: WIN32` (not `shell: true`). On Windows
  // they're equivalent; on Unix `shell: WIN32 === false` is the right
  // value (no shell wrapping for the unreachable POSIX branch of a
  // Windows-only test).
  //
  // Exercises the `.cmd`-extension-stripping code path in spawnSync
  // (`src/process/spawn/child.ts:452`) using a self-written `.cmd`
  // script in a tmpdir. The earlier `npm.cmd --version` reproducer
  // reliably deadlocked `spawnSync` on the GitHub Actions windows-
  // latest runner because pnpm's Socket Firewall shim wraps stdin in
  // a way `spawnSync` can't drain — the async-spawn sibling in
  // spawn.test.mts doesn't hit that because Node's async pipe
  // machinery handles the shim's writes gracefully; the sync path
  // blocks. Using our own `.cmd` script bypasses the sfw-shim trap
  // while still exercising the same Node spawn-on-Windows mechanic.
  itWindowsOnly('should handle Windows script extensions on Windows', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'spawn-sync-cmd-'))
    try {
      const cmdPath = path.join(tmp, 'hello.cmd')
      writeFileSync(cmdPath, '@echo hello\r\n')
      const result = spawnSync(cmdPath, [], {
        shell: WIN32,
      })
      expect(result.status).toBe(0)
      expect(String(result.stdout)).toContain('hello')
    } finally {
      safeDeleteSync(tmp)
    }
  })

  itUnixOnly('should handle shell as string path', () => {
    const result = spawnSync('echo', ['hello'], {
      shell: '/bin/sh',
    })
    expect(result.status).toBe(0)
  })

  it('should handle undefined args', () => {
    const result = spawnSync('pwd', undefined)
    expect(result.status).toBe(0)
  })

  it('should handle undefined options', () => {
    const result = spawnSync('echo', ['hello'], undefined)
    expect(result.status).toBe(0)
  })

  it('should handle empty options object', () => {
    const result = spawnSync('echo', ['hello'], {})
    expect(result.status).toBe(0)
  })

  it('should have signal property', () => {
    const result = spawnSync('echo', ['hello'])
    expect('signal' in result).toBe(true)
  })

  it('should have pid property', () => {
    const result = spawnSync('echo', ['hello'])
    expect(typeof result.pid).toBe('number')
    expect(result.pid).toBeGreaterThan(0)
  })

  it('should handle non-existent command (spawnSync)', () => {
    const result = spawnSync('nonexistent-command-12345')
    expect(result.error).toBeTruthy()
  })

  describe('cross-platform behavior', () => {
    it('should work on current platform', () => {
      const result = spawnSync('echo', ['hello'])
      expect(result.status).toBe(0)
    })

    it('should handle platform-specific line endings', () => {
      const result = spawnSync('echo', ['hello'])
      expect(result.stdout).toBeTruthy()
    })
  })
})
