/**
 * @file Tests for pnpm-specific flag and command detection helpers.
 *   Covers isPnpmIgnoreScriptsFlag(), isPnpmFrozenLockfileFlag(),
 *   isPnpmInstallCommand(), and isPnpmLoglevelFlag(). The loglevel helper is
 *   expected to behave identically to npm's; the npm oracle in that comparison
 *   comes from the published `-stable` snapshot so the test can't validate
 *   `src/` against itself.
 */

import { describe, expect, it } from 'vitest'

import { isNpmLoglevelFlag as isNpmLoglevelFlagStable } from '@socketsecurity/lib-stable/eco/npm/npm/flags'

import {
  isPnpmFrozenLockfileFlag,
  isPnpmIgnoreScriptsFlag,
  isPnpmInstallCommand,
  isPnpmLoglevelFlag,
} from '../../../../src/eco/npm/pnpm/flags'

describe('pnpm flag detection', () => {
  describe('isPnpmIgnoreScriptsFlag', () => {
    it('should return true for --ignore-scripts', () => {
      expect(isPnpmIgnoreScriptsFlag('--ignore-scripts')).toBe(true)
    })

    it('should return true for --no-ignore-scripts', () => {
      expect(isPnpmIgnoreScriptsFlag('--no-ignore-scripts')).toBe(true)
    })

    it('should return false for --ignore-scripts=true', () => {
      expect(isPnpmIgnoreScriptsFlag('--ignore-scripts=true')).toBe(false)
    })

    it('should return false for --ignore-script', () => {
      expect(isPnpmIgnoreScriptsFlag('--ignore-script')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isPnpmIgnoreScriptsFlag('')).toBe(false)
    })

    it('should return false for --ignore', () => {
      expect(isPnpmIgnoreScriptsFlag('--ignore')).toBe(false)
    })
  })

  describe('isPnpmFrozenLockfileFlag', () => {
    it('should return true for --frozen-lockfile', () => {
      expect(isPnpmFrozenLockfileFlag('--frozen-lockfile')).toBe(true)
    })

    it('should return true for --no-frozen-lockfile', () => {
      expect(isPnpmFrozenLockfileFlag('--no-frozen-lockfile')).toBe(true)
    })

    it('should return false for --frozen-lockfile=true', () => {
      expect(isPnpmFrozenLockfileFlag('--frozen-lockfile=true')).toBe(false)
    })

    it('should return false for --frozen', () => {
      expect(isPnpmFrozenLockfileFlag('--frozen')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isPnpmFrozenLockfileFlag('')).toBe(false)
    })

    it('should return false for --lockfile', () => {
      expect(isPnpmFrozenLockfileFlag('--lockfile')).toBe(false)
    })
  })

  describe('isPnpmInstallCommand', () => {
    it('should return true for install', () => {
      expect(isPnpmInstallCommand('install')).toBe(true)
    })

    it('should return true for i', () => {
      expect(isPnpmInstallCommand('i')).toBe(true)
    })

    it('should return false for add', () => {
      expect(isPnpmInstallCommand('add')).toBe(false)
    })

    it('should return false for update', () => {
      expect(isPnpmInstallCommand('update')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isPnpmInstallCommand('')).toBe(false)
    })

    it('should return false for Install (capital)', () => {
      expect(isPnpmInstallCommand('Install')).toBe(false)
    })

    it('should return false for I (capital)', () => {
      expect(isPnpmInstallCommand('I')).toBe(false)
    })

    it('should be case sensitive for commands', () => {
      expect(isPnpmInstallCommand('INSTALL')).toBe(false)
      expect(isPnpmInstallCommand('Install')).toBe(false)
      expect(isPnpmInstallCommand('I')).toBe(false)
    })
  })

  describe('isPnpmLoglevelFlag', () => {
    it('should behave identically to isNpmLoglevelFlag', () => {
      // Module dedup is unreliable under vitest's threaded pool — the
      // two import paths can resolve to distinct copies of the
      // function reference. Verify behavioral identity across the
      // exhaustive input set instead of `===`. The npm oracle comes from
      // the published `-stable` snapshot so this never validates src
      // against itself.
      const samples = [
        '--loglevel',
        '--loglevel=warn',
        '-l',
        '--silent',
        '--quiet',
        '-q',
        '--unrelated',
        '',
      ]
      for (let i = 0, { length } = samples; i < length; i += 1) {
        const s = samples[i]!
        expect(isPnpmLoglevelFlag(s)).toBe(isNpmLoglevelFlagStable(s))
      }
    })

    it('should return true for --loglevel', () => {
      expect(isPnpmLoglevelFlag('--loglevel')).toBe(true)
    })

    it('should return true for --silent', () => {
      expect(isPnpmLoglevelFlag('--silent')).toBe(true)
    })

    it('should return true for -d', () => {
      expect(isPnpmLoglevelFlag('-d')).toBe(true)
    })
  })
})
