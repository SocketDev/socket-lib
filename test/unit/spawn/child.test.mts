import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { spawn, spawnExitResult } from '../../../src/process/spawn/child'
import { isSpawnError } from '../../../src/process/spawn/errors'

import { itUnixOnly, itWindowsOnly } from '../util/skip-helpers'

describe('spawn/child — spawn', () => {
  it('accepts a platform-scaled localTimeout', async () => {
    const result = await spawn('echo', ['ok'], { localTimeout: 5000 })
    expect(result.stdout).toContain('ok')
  })

  it('spawns a simple command successfully', async () => {
    const result = await spawn('echo', ['hello'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('hello')
  })

  it('spawns command without args', async () => {
    const result = await spawn('pwd')
    expect(result.code).toBe(0)
    expect(typeof result.stdout).toBe('string')
  })

  it('captures stdout', async () => {
    const result = await spawn('echo', ['test output'])
    expect(result.stdout).toContain('test output')
  })

  it('returns command and args in result', async () => {
    const result = await spawn('echo', ['hello'])
    expect(result.cmd).toMatch(/echo(?:\.exe)?$/i)
    expect(result.args).toEqual(['hello'])
  })

  it('handles commands with multiple args', async () => {
    const result = await spawn('echo', ['arg1', 'arg2', 'arg3'])
    expect(result.code).toBe(0)
  })

  it('handles empty args array', async () => {
    const result = await spawn('pwd', [])
    expect(result.code).toBe(0)
  })

  it('handles options with cwd', async () => {
    const result = await spawn('pwd', [], {
      cwd: process.cwd(),
    })
    expect(result.code).toBe(0)
  })

  it('handles options with env', async () => {
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

  it('handles stdio: pipe (default)', async () => {
    const result = await spawn('echo', ['hello'], {
      stdio: 'pipe',
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toBeTruthy()
  })

  it('handles stdio: inherit', async () => {
    const result = await spawn('echo', ['hello'], {
      stdio: 'inherit',
    })
    expect(result.code).toBe(0)
  })

  it('handles stdio as array', async () => {
    const result = await spawn('echo', ['hello'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(result.code).toBe(0)
  })

  it('handles stdioString: true (default)', async () => {
    const result = await spawn('echo', ['hello'], {
      stdioString: true,
    })
    expect(typeof result.stdout).toBe('string')
    expect(typeof result.stderr).toBe('string')
  })

  it('handles stdioString: false', async () => {
    const result = await spawn('echo', ['hello'], {
      stdioString: false,
    })
    expect(Buffer.isBuffer(result.stdout)).toBe(true)
    expect(Buffer.isBuffer(result.stderr)).toBe(true)
  })

  it('strips ANSI codes by default', async () => {
    const result = await spawn(
      'node',
      ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
      {},
    )
    expect(result.code).toBe(0)
    expect(result.stdout).not.toContain('\x1b[31m')
    expect(result.stdout).toContain('red')
  })

  it('does not strip ANSI codes when stripAnsi: false', async () => {
    const result = await spawn(
      'node',
      ['-e', 'console.log("\\x1b[31mred\\x1b[0m")'],
      {
        stripAnsi: false,
      },
    )
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('\x1b[31m')
  })

  it('handles readonly args array', async () => {
    const args = ['hello'] as const
    const result = await spawn('echo', args)
    expect(result.code).toBe(0)
  })

  it('throws error for non-zero exit code', async () => {
    try {
      await spawn('sh', ['-c', 'exit 1'])
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })

  it('includes stderr in error', async () => {
    try {
      await spawn('sh', ['-c', 'echo error >&2; exit 1'])
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as { stderr?: unknown | undefined }).stderr).toBeTruthy()
    }
  })

  it('has process property on result', () => {
    const result = spawn('echo', ['hello'])
    expect(result.process).toBeTruthy()
    expect(typeof result.process.kill).toBe('function')
  })

  it('has stdin property on result', async () => {
    const result = spawn('cat', [])
    expect(result.process.stdin).toBeTruthy()
    result.process.kill()
    try {
      await result
    } catch {
      // Expected to fail since we killed it
    }
  })

  itWindowsOnly('handles Windows script extensions on Windows', async () => {
    const result = await spawn('npm.cmd', ['--version'], {
      // itWindowsOnly: this runs only on Windows, where shell:true is the
      // intended cmd.exe wrap being exercised.
      // oxlint-disable-next-line socket/prefer-shell-win32 -- windows-only
      shell: true,
    })
    expect(result.code).toBe(0)
  })

  itUnixOnly('handles shell as string path', async () => {
    const result = await spawn('echo', ['hello'], {
      shell: '/bin/sh',
    })
    expect(result.code).toBe(0)
  })

  it('handles undefined args', async () => {
    const result = await spawn('pwd', undefined)
    expect(result.code).toBe(0)
  })

  it('handles undefined options', async () => {
    const result = await spawn('echo', ['hello'], undefined)
    expect(result.code).toBe(0)
  })

  it('handles empty options object', async () => {
    const result = await spawn('echo', ['hello'], {})
    expect(result.code).toBe(0)
  })
})

describe('spawn/child — error cases', () => {
  it('handles non-existent command (spawn)', async () => {
    try {
      await spawn('nonexistent-command-12345')
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })

  it('handles command with invalid args', async () => {
    try {
      await spawn('ls', ['--invalid-flag-that-does-not-exist-xyz'])
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })
})

describe('spawn/child — security', () => {
  it('safely handles user input in args array', async () => {
    const userInput = '; rm -rf /'
    const { stdout } = await spawn('echo', [userInput])
    expect(stdout).toContain(';')
    expect(stdout).toContain('rm')
  })

  it('safely handles special characters', async () => {
    const result = await spawn('echo', ['$PATH', '&&', 'echo', 'test'])
    expect(result.code).toBe(0)
  })
})

describe('spawn/child — throws option', () => {
  it('rejects on non-zero exit by default', async () => {
    try {
      await spawn('node', ['-e', 'process.exit(2)'])
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })

  it('rejects on non-zero exit with explicit throws: true', async () => {
    try {
      await spawn('node', ['-e', 'process.exit(2)'], { throws: true })
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })

  it('resolves with the non-zero exit code when throws: false', async () => {
    const { code } = await spawn('node', ['-e', 'process.exit(3)'], {
      throws: false,
    })
    expect(code).toBe(3)
  })

  it('sets the exitCode alias on the resolved failure result', async () => {
    const settled = await spawn('node', ['-e', 'process.exit(7)'], {
      throws: false,
    })
    expect((settled as typeof settled & { exitCode: number }).exitCode).toBe(7)
  })

  it('carries stdout and stderr on the resolved failure result', async () => {
    const { code, stderr, stdout } = await spawn(
      'node',
      [
        '-e',
        'process.stdout.write("partial out"); process.stderr.write("the error"); process.exit(4)',
      ],
      { throws: false },
    )
    expect(code).toBe(4)
    expect(stdout).toContain('partial out')
    expect(stderr).toContain('the error')
  })

  it('resolves the zero-exit success path unchanged', async () => {
    const { code, stdout } = await spawn('echo', ['fine'], { throws: false })
    expect(code).toBe(0)
    expect(stdout).toContain('fine')
  })

  it('still rejects a launch failure — there is no exit code to resolve', async () => {
    try {
      await spawn('nonexistent-command-12345', [], { throws: false })
      expect.fail('Should have thrown')
    } catch (e) {
      expect(isSpawnError(e)).toBe(true)
    }
  })

  it('strips ANSI from the resolved failure result by default', async () => {
    const { code, stderr } = await spawn(
      'node',
      ['-e', 'process.stderr.write("\\x1b[31mred\\x1b[0m"); process.exit(5)'],
      { throws: false },
    )
    expect(code).toBe(5)
    expect(stderr).not.toContain('\x1b[31m')
    expect(stderr).toContain('red')
  })

  it('returns Buffers on the resolved failure result with stdioString: false', async () => {
    const { code, stdout } = await spawn(
      'node',
      ['-e', 'process.stdout.write("bytes"); process.exit(6)'],
      { stdioString: false, throws: false },
    )
    expect(code).toBe(6)
    expect(Buffer.isBuffer(stdout)).toBe(true)
  })

  it('resolves a signal-killed child instead of rejecting', async () => {
    const childPromise = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {
      throws: false,
    })
    childPromise.process.kill('SIGTERM')
    const { signal } = await childPromise
    expect(signal).toBe('SIGTERM')
  })
})

describe('spawn/child — spawnExitResult', () => {
  it('returns undefined for a non-error value', () => {
    expect(spawnExitResult({ code: 1 })).toBe(undefined)
  })

  it('returns undefined for a launch failure carrying a string code', () => {
    const launchError = Object.assign(new Error('spawn failed'), {
      args: [],
      cmd: 'nope',
      code: 'ENOENT',
      signal: undefined,
      stderr: '',
      stdout: '',
    })
    expect(spawnExitResult(launchError)).toBe(undefined)
  })

  it('extracts the result shape from a numeric-exit rejection', () => {
    const exitError = Object.assign(new Error('command failed'), {
      args: ['status'],
      cmd: 'git',
      code: 128,
      signal: undefined,
      stderr: 'fatal: not a repository',
      stdout: '',
    })
    expect(spawnExitResult(exitError)).toStrictEqual({
      args: ['status'],
      cmd: 'git',
      code: 128,
      exitCode: 128,
      signal: undefined,
      stderr: 'fatal: not a repository',
      stdout: '',
    })
  })

  it('accepts a signal-terminated rejection whose code is null', () => {
    // promise-spawn rejects a signal-killed child with `code: null` (its
    // close handler passes Node's exit code through verbatim), so the
    // fixture must carry the literal null to stay faithful to the wire.
    const signalError = Object.assign(new Error('command failed'), {
      args: [],
      cmd: 'sleep',
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- faithful promise-spawn rejection shape
      code: null,
      signal: 'SIGKILL',
      stderr: '',
      stdout: '',
    })
    const result = spawnExitResult(signalError)
    expect(result?.signal).toBe('SIGKILL')
  })
})

describe('spawn/child — spinner stop/restart around child process', () => {
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
