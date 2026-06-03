/**
 * @file Unit tests for process spawn utilities. Tests child process spawning
 *   utilities:
 *
 *   - spawn() async process execution with options
 *   - isSpawnError() type guard for spawn errors
 *   - isStdioType() validates stdio option values
 *   - Error handling, exit codes, and output capture Used by Socket tools for git
 *     operations, npm commands, and external process execution.
 */

import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { spawn } from '../../src/process/spawn/child'
import { isSpawnError } from '../../src/process/spawn/errors'
import { isStdioType } from '../../src/process/spawn/stdio'

import { itUnixOnly, itWindowsOnly } from './util/skip-helpers'

describe('spawn', () => {
  describe('isSpawnError', () => {
    it('should return true for error with code property', () => {
      const error = { code: 1 }
      expect(isSpawnError(error)).toBe(true)
    })

    it('should return true for error with errno property', () => {
      const error = { errno: -2 }
      expect(isSpawnError(error)).toBe(true)
    })

    it('should return true for error with syscall property', () => {
      const error = { syscall: 'spawn' }
      expect(isSpawnError(error)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isSpawnError(undefined)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isSpawnError(undefined)).toBe(false)
    })

    it('should return false for non-object', () => {
      expect(isSpawnError('string')).toBe(false)
      expect(isSpawnError(123)).toBe(false)
      expect(isSpawnError(true)).toBe(false)
    })

    it('should return false for object without spawn error properties', () => {
      expect(isSpawnError({})).toBe(false)
      expect(isSpawnError({ message: 'error' })).toBe(false)
    })

    it('should handle error with undefined code', () => {
      const error = { code: undefined, errno: 1 }
      expect(isSpawnError(error)).toBe(true)
    })
  })

  describe('isStdioType', () => {
    describe('single argument mode (validation)', () => {
      it('should return true for valid stdio types', () => {
        expect(isStdioType('pipe')).toBe(true)
        expect(isStdioType('ignore')).toBe(true)
        expect(isStdioType('inherit')).toBe(true)
        expect(isStdioType('overlapped')).toBe(true)
      })

      it('should return false for invalid types', () => {
        expect(isStdioType('invalid')).toBe(false)
        expect(isStdioType('ipc')).toBe(false) // 'ipc' is valid for spawn but not a base IOType
        expect(isStdioType('')).toBe(false)
      })

      it('should return false for arrays', () => {
        expect(isStdioType(['pipe'])).toBe(false)
      })
    })

    describe('two argument mode (matching)', () => {
      it('should match exact string types', () => {
        expect(isStdioType('pipe', 'pipe')).toBe(true)
        expect(isStdioType('ignore', 'ignore')).toBe(true)
        expect(isStdioType('inherit', 'inherit')).toBe(true)
      })

      it('should not match different types', () => {
        expect(isStdioType('pipe', 'ignore')).toBe(false)
        expect(isStdioType('ignore', 'pipe')).toBe(false)
      })

      it('should treat null/undefined as pipe', () => {
        expect(isStdioType(undefined as unknown as string, 'pipe')).toBe(true)
        expect(isStdioType(undefined as unknown as string, 'pipe')).toBe(true)
        expect(isStdioType(undefined as unknown as string, 'ignore')).toBe(
          false,
        )
      })

      it('should match array with all elements same as type', () => {
        expect(isStdioType(['pipe', 'pipe', 'pipe'], 'pipe')).toBe(true)
        expect(isStdioType(['ignore', 'ignore', 'ignore'], 'ignore')).toBe(true)
      })

      it('should not match array with different elements', () => {
        expect(isStdioType(['pipe', 'ignore', 'pipe'], 'pipe')).toBe(false)
        expect(isStdioType(['pipe', 'pipe', 'ignore'], 'pipe')).toBe(false)
      })

      it('should not match array with less than 3 elements', () => {
        expect(isStdioType(['pipe', 'pipe'], 'pipe')).toBe(false)
        expect(isStdioType(['pipe'], 'pipe')).toBe(false)
      })

      it('should match array with more than 3 elements if first 3 match', () => {
        expect(isStdioType(['pipe', 'pipe', 'pipe', 'inherit'], 'pipe')).toBe(
          true,
        )
      })
    })
  })

  describe('spawn', () => {
    it('should spawn a simple command successfully', async () => {
      const result = await spawn('echo', ['hello'])
      expect(result.code).toBe(0)
      expect(result.stdout).toContain('hello')
    })

    it('should spawn command without args', async () => {
      const result = await spawn('pwd')
      expect(result.code).toBe(0)
      expect(typeof result.stdout).toBe('string')
    })

    it('should capture stdout', async () => {
      const result = await spawn('echo', ['test output'])
      expect(result.stdout).toContain('test output')
    })

    it('should return command and args in result', async () => {
      const result = await spawn('echo', ['hello'])
      // cmd is now resolved to full path via which, e.g. '/bin/echo'
      expect(result.cmd).toMatch(/echo(?:\.exe)?$/i)
      expect(result.args).toEqual(['hello'])
    })

    it('should handle commands with multiple args', async () => {
      const result = await spawn('echo', ['arg1', 'arg2', 'arg3'])
      expect(result.code).toBe(0)
    })

    it('should handle empty args array', async () => {
      const result = await spawn('pwd', [])
      expect(result.code).toBe(0)
    })

    it('should handle options with cwd', async () => {
      const result = await spawn('pwd', [], {
        cwd: process.cwd(),
      })
      expect(result.code).toBe(0)
    })

    it('should handle options with env', async () => {
      // Test that custom env is passed to spawned process
      // Use node to read env var directly without shell expansion
      const result = await spawn(
        'node',
        ['-e', 'console.log(process.env.TEST_VAR)'],
        {
          env: { ...process.env, TEST_VAR: 'test-value' },
        },
      )
      expect(result.code).toBe(0)
      expect(result.stdout?.toString().trim()).toBe('test-value')
    })

    it('should handle stdio: pipe (default)', async () => {
      const result = await spawn('echo', ['hello'], {
        stdio: 'pipe',
      })
      expect(result.code).toBe(0)
      expect(result.stdout).toBeTruthy()
    })

    it('should handle stdio: inherit', async () => {
      const result = await spawn('echo', ['hello'], {
        stdio: 'inherit',
      })
      expect(result.code).toBe(0)
    })

    it('should handle stdio as array', async () => {
      const result = await spawn('echo', ['hello'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      expect(result.code).toBe(0)
    })

    it('should handle stdioString: true (default)', async () => {
      const result = await spawn('echo', ['hello'], {
        stdioString: true,
      })
      expect(typeof result.stdout).toBe('string')
      expect(typeof result.stderr).toBe('string')
    })

    it('should handle stdioString: false', async () => {
      const result = await spawn('echo', ['hello'], {
        stdioString: false,
      })
      expect(Buffer.isBuffer(result.stdout)).toBe(true)
      expect(Buffer.isBuffer(result.stderr)).toBe(true)
    })

    it('should strip ANSI codes by default', async () => {
      // Test with a command that outputs ANSI codes
      const result = await spawn(
        'node',
        ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
        {},
      )
      expect(result.code).toBe(0)
      // ANSI codes should be stripped (default behavior)
      expect(result.stdout).not.toContain('\x1b[31m')
      expect(result.stdout).toContain('red')
    })

    it('should not strip ANSI codes when stripAnsi: false', async () => {
      const result = await spawn(
        'node',
        ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
        {
          stripAnsi: false,
        },
      )
      expect(result.code).toBe(0)
      // ANSI codes should NOT be stripped
      expect(result.stdout).toContain('\x1b[31m')
    })

    it('should handle readonly args array', async () => {
      const args = ['hello'] as const
      const result = await spawn('echo', args)
      expect(result.code).toBe(0)
    })

    it('should throw error for non-zero exit code', async () => {
      try {
        await spawn('sh', ['-c', 'exit 1'])
        expect.fail('Should have thrown')
      } catch (e) {
        expect(isSpawnError(e)).toBe(true)
      }
    })

    it('should include stderr in error', async () => {
      try {
        await spawn('sh', ['-c', 'echo error >&2; exit 1'])
        expect.fail('Should have thrown')
      } catch (error) {
        expect((error as { stderr?: unknown | undefined }).stderr).toBeTruthy()
      }
    })

    it('should have process property on result', () => {
      const result = spawn('echo', ['hello'])
      expect(result.process).toBeTruthy()
      expect(typeof result.process.kill).toBe('function')
    })

    it('should have stdin property on result', async () => {
      const result = spawn('cat', [])
      expect(result.stdin).toBeTruthy()
      result.process.kill()
      // Wait for process to be killed
      try {
        await result
      } catch {
        // Expected to fail since we killed it
      }
    })

    itWindowsOnly(
      'should handle Windows script extensions on Windows',
      async () => {
        const result = await spawn('npm.cmd', ['--version'], {
          // oxlint-disable-next-line socket/prefer-shell-win32 -- itWindowsOnly: this runs only on Windows, where shell:true is the intended cmd.exe wrap being exercised.
          shell: true,
        })
        expect(result.code).toBe(0)
      },
    )

    itUnixOnly('should handle shell as string path', async () => {
      const result = await spawn('echo', ['hello'], {
        shell: '/bin/sh',
      })
      expect(result.code).toBe(0)
    })

    it('should handle undefined args', async () => {
      const result = await spawn('pwd', undefined)
      expect(result.code).toBe(0)
    })

    it('should handle undefined options', async () => {
      const result = await spawn('echo', ['hello'], undefined)
      expect(result.code).toBe(0)
    })

    it('should handle empty options object', async () => {
      const result = await spawn('echo', ['hello'], {})
      expect(result.code).toBe(0)
    })
  })

  describe('error cases', () => {
    it('should handle non-existent command (spawn)', async () => {
      try {
        await spawn('nonexistent-command-12345')
        expect.fail('Should have thrown')
      } catch (e) {
        expect(isSpawnError(e)).toBe(true)
      }
    })

    it('should handle command with invalid args', async () => {
      try {
        await spawn('ls', ['--invalid-flag-that-does-not-exist-xyz'])
        expect.fail('Should have thrown')
      } catch (e) {
        expect(isSpawnError(e)).toBe(true)
      }
    })
  })

  describe('security', () => {
    it('should safely handle user input in args array', async () => {
      const userInput = '; rm -rf /'
      const result = await spawn('echo', [userInput])
      expect(result.stdout).toContain(';')
      expect(result.stdout).toContain('rm')
    })

    it('should safely handle special characters', async () => {
      const result = await spawn('echo', ['$PATH', '&&', 'echo', 'test'])
      expect(result.code).toBe(0)
    })
  })

  describe('spinner stop/restart around child process', () => {
    it('stops the spinner while the child runs and restarts after success', async () => {
      let stopCount = 0
      let startCount = 0
      const spinnerMock = {
        isSpinning: true,
        stop: () => {
          stopCount += 1
        },
        start: () => {
          startCount += 1
        },
      }
      await spawn('echo', ['ok'], {
        spinner: spinnerMock as never,
        stdio: 'inherit',
      })
      expect(stopCount).toBe(1)
      expect(startCount).toBe(1)
    })

    it('restarts the spinner even when the child errors', async () => {
      let stopCount = 0
      let startCount = 0
      const spinnerMock = {
        isSpinning: true,
        stop: () => {
          stopCount += 1
        },
        start: () => {
          startCount += 1
        },
      }
      await spawn('node', ['-e', 'process.exit(7)'], {
        spinner: spinnerMock as never,
        stdio: 'inherit',
      }).catch(() => {})
      expect(stopCount).toBe(1)
      expect(startCount).toBe(1)
    })
  })
})
