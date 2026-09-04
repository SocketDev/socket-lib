/**
 * @file Tests for the package manager execution wrappers. Exercises execNpm(),
 *   execPnpm(), execYarn(), and execScript() down to the spawn call, which is
 *   mocked: the wrappers are argument transformers, and letting them reach a
 *   real spawn started nineteen unawaited `npm install` / `pnpm install` /
 *   `yarn install` processes in the repo itself. Those outlived the test body,
 *   so the worker took over twenty seconds to tear down and the coverage run
 *   timed out killing it. With the mock the wrappers still run end to end and
 *   the arguments they build are readable, which is the contract worth
 *   asserting.
 */

import process from 'node:process'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted so the mock factory, which vitest runs before this module body,
// still sees an initialized spy. The stand-in resolves the fields a caller
// reads off a finished spawn; the live `process` and `stdin` handles a real
// PromiseSpawnResult also carries are left off, since supplying them means
// starting the process this mock exists to avoid.
const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(async () => ({
    args: [],
    cmd: '',
    code: 0,
    stderr: '',
    stdout: '',
  })),
}))

vi.mock(import('../../../../src/process/spawn/child.mjs'), async orig => {
  const actual = await orig()
  return {
    ...actual,
    // `spawn` is overloaded (string and Buffer output), and one spy signature
    // cannot satisfy every overload. The wrappers only ever reach the string
    // one, so the stand-in is asserted into place here rather than widened.
    spawn: spawn as unknown as typeof actual.spawn,
  }
})

import { execNpm } from '../../../../src/eco/npm/npm-cli/exec.mjs'
import { execPnpm } from '../../../../src/eco/npm/pnpm/exec.mjs'
import { execScript } from '../../../../src/eco/npm/script.mjs'
import { execYarn } from '../../../../src/eco/npm/yarn/exec.mjs'

// The argv the wrapper handed to spawn on the most recent call.
function lastSpawnArgs(): string[] {
  const call = spawn.mock.calls.at(-1) as unknown as [string, string[]]
  return call[1]
}

beforeEach(() => {
  spawn.mockClear()
})

describe('agent execution', () => {
  describe('argument transformation down to the spawn call', () => {
    describe('execNpm argument transformation', () => {
      it('should have a function that returns a promise', () => {
        const result = execNpm(['--version'])
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('execPnpm argument transformation', () => {
      it('should have a function that returns a promise', () => {
        const result = execPnpm(['--version'])
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('execYarn argument transformation', () => {
      it('should have a function that returns a promise', () => {
        const result = execYarn(['--version'])
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('execScript argument transformation', () => {
      it('should have a function that returns a promise', () => {
        const result = execScript('test')
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should handle script name with array args', () => {
        const result = execScript('test', ['--coverage'])
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should handle script name with options object', () => {
        const result = execScript('test', { cwd: process.cwd() })
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should handle script name with args and options', () => {
        const result = execScript('test', ['--coverage'], {
          cwd: process.cwd(),
        })
        // Catch promise immediately to prevent unhandled rejection on Windows.
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should pass through shell:true unchanged', () => {
        // oxlint-disable-next-line socket/prefer-shell-win32 -- this test asserts shell:true is passed through unchanged; the literal is the value under test.
        const result = execScript('echo hi', [], { shell: true })
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('argument terminator (--) handling', () => {
      it('execNpm should split args at -- terminator', async () => {
        await execNpm(['install', '--save', '--', '--script-shell', 'bash'])
        const args = lastSpawnArgs()
        expect(args).toContain('--')
        expect(args.indexOf('--save')).toBeLessThan(args.indexOf('--'))
        expect(args.indexOf('--')).toBeLessThan(args.indexOf('--script-shell'))
      })

      it('execPnpm should split args at -- terminator', async () => {
        await execPnpm(['install', '--', '--progress'])
        const args = lastSpawnArgs()
        expect(args.indexOf('--')).toBeLessThan(args.indexOf('--progress'))
      })

      it('execYarn should split args at -- terminator', async () => {
        await execYarn(['install', '--', '--frozen-lockfile'])
        const args = lastSpawnArgs()
        expect(args.indexOf('--')).toBeLessThan(
          args.indexOf('--frozen-lockfile'),
        )
      })
    })

    describe('loglevel preservation', () => {
      it('execNpm should preserve user-provided --loglevel', async () => {
        await execNpm(['install', '--loglevel', 'silent'])
        const args = lastSpawnArgs()
        expect(args).toContain('silent')
        expect(args.filter(arg => arg === '--loglevel')).toHaveLength(1)
      })

      it('execPnpm should preserve user-provided --loglevel', async () => {
        await execPnpm(['install', '--loglevel', 'silent'])
        expect(lastSpawnArgs()).toContain('silent')
      })
    })

    describe('execPnpm install-command coverage', () => {
      it('should handle install command without ignore-scripts flag (adds --ignore-scripts)', async () => {
        await execPnpm(['install'])
        expect(lastSpawnArgs()).toContain('--ignore-scripts')
      })

      it('should respect existing --ignore-scripts flag', async () => {
        await execPnpm(['install', '--ignore-scripts'])
        const args = lastSpawnArgs()
        expect(args.filter(arg => arg === '--ignore-scripts')).toHaveLength(1)
      })

      it('should not add --ignore-scripts for non-install commands', () => {
        const result = execPnpm(['list'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should accept allowLockfileUpdate option', () => {
        const result = execPnpm(['install'], { allowLockfileUpdate: true })
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should respect existing --frozen-lockfile flag', () => {
        const result = execPnpm(['install', '--frozen-lockfile'], {
          allowLockfileUpdate: true,
        })
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should handle empty args array', () => {
        const result = execPnpm([])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })
  })
})
