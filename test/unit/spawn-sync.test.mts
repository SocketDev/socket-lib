/**
 * @file Unit tests for synchronous process spawn utilities. Tests spawnSync()
 *   synchronous process execution: exit status, output capture, stdio handling,
 *   ANSI stripping, and error cases. Companion to spawn.test.mts, which covers
 *   the async spawn() path. Used by Socket tools for git operations, npm
 *   commands, and external process execution.
 */

import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { spawnSync } from '../../src/process/spawn/child'

import { itUnixOnly, itWindowsOnly } from './util/skip-helpers'

describe('spawnSync', () => {
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

  itWindowsOnly('should handle Windows script extensions on Windows', () => {
    const result = spawnSync('npm.cmd', ['--version'], {
      shell: true,
    })
    expect(result.status).toBe(0)
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
