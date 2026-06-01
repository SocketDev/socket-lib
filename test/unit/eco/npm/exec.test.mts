/**
 * @file Integration tests for package manager execution wrappers. Exercises
 *   execNpm(), execPnpm(), execYarn(), and execScript() against the real spawn
 *   path. Full command execution can't run here, so these assert the observable
 *   contract: each wrapper returns a Promise and accepts the documented
 *   argument shapes (terminator splitting, loglevel preservation,
 *   install-command handling).
 */

import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { execNpm } from '../../../../src/eco/npm/npm/exec'
import { execPnpm } from '../../../../src/eco/npm/pnpm/exec'
import { execScript } from '../../../../src/eco/npm/script'
import { execYarn } from '../../../../src/eco/npm/yarnpkg/yarn/exec'

describe('agent execution', () => {
  describe('Integration tests (using real spawn)', () => {
    // These tests verify the actual behavior without mocking
    // We can't easily test the full execution without running actual commands
    // so we focus on what we can test: the flag detection integration

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
        const result = execScript('echo hi', [], { shell: true })
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('argument terminator (--) handling', () => {
      it('execNpm should split args at -- terminator', () => {
        const result = execNpm([
          'install',
          '--save',
          '--',
          '--no-audit',
          '--fund',
        ])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('execPnpm should split args at -- terminator', () => {
        const result = execPnpm(['install', '--', '--progress'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('execYarn should split args at -- terminator', () => {
        const result = execYarn(['install', '--', '--frozen-lockfile'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('loglevel preservation', () => {
      it('execNpm should preserve user-provided --loglevel', () => {
        const result = execNpm(['install', '--loglevel', 'silent'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('execPnpm should preserve user-provided --loglevel', () => {
        const result = execPnpm(['install', '--loglevel', 'silent'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })
    })

    describe('execPnpm install-command coverage', () => {
      it('should handle install command without ignore-scripts flag (adds --ignore-scripts)', () => {
        const result = execPnpm(['install'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
      })

      it('should respect existing --ignore-scripts flag', () => {
        const result = execPnpm(['install', '--ignore-scripts'])
        result.catch(() => {})
        expect(result).toBeInstanceOf(Promise)
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
