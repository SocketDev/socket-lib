/**
 * @fileoverview Unit tests for parse-lockfile dispatcher.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib/eco/manifest/manifest-error'
import {
  parseLockfile,
  sniffLockfileFormat,
} from '@socketsecurity/lib/eco/manifest/parse-lockfile'

describe('eco/manifest/parse-lockfile', () => {
  describe('sniffLockfileFormat', () => {
    it('sniffs npm format from "lockfileVersion"', () => {
      expect(sniffLockfileFormat('"lockfileVersion": 3')).toBe('npm')
    })

    it('sniffs yarn classic from "yarn lockfile"', () => {
      expect(sniffLockfileFormat('# yarn lockfile v1\n')).toBe('yarn')
    })

    it('sniffs yarn berry from "__metadata:"', () => {
      expect(sniffLockfileFormat('__metadata:\n  version: 6\n')).toBe('yarn')
    })

    it('sniffs pnpm from "lockfileVersion:"', () => {
      expect(sniffLockfileFormat('lockfileVersion: 5.4\n')).toBe('pnpm')
    })

    it('returns undefined when nothing matches', () => {
      expect(sniffLockfileFormat('hello world')).toBe(undefined)
    })
  })

  describe('parseLockfile (with explicit format)', () => {
    it('routes npm format to parsePackageLock', () => {
      const result = parseLockfile(
        JSON.stringify({
          lockfileVersion: 3,
          packages: { 'node_modules/x': { version: '1.0.0' } },
        }),
        'npm',
        'npm',
      )
      expect(result.type).toBe('lockfile')
      expect(result.packages[0]!.name).toBe('x')
    })

    it('routes yarn format to parseYarnLock', () => {
      const result = parseLockfile(
        '"foo@^1.0.0":\n  version "1.0.0"\n',
        'npm',
        'yarn',
      )
      expect(result.type).toBe('lockfile')
      expect(result.lockVersion).toBe('1')
    })

    it('routes pnpm format to parsePnpmLock', () => {
      const result = parseLockfile(
        "lockfileVersion: '9.0'\n\nsnapshots:\n\n  lodash@4.17.21:\n    resolution: {integrity: sha512-x}\n",
        'npm',
        'pnpm',
      )
      expect(result.lockVersion).toBe('9')
    })

    it('routes cargo ecosystem to parseCargoLock', () => {
      const result = parseLockfile(
        '[[package]]\nname = "serde"\nversion = "1.0.0"\n',
        'cargo',
      )
      expect(result.ecosystem).toBe('cargo')
      expect(result.packages[0]!.name).toBe('serde')
    })

    it('routes cargo format (within an npm ecosystem call) to parseCargoLock', () => {
      const result = parseLockfile(
        '[[package]]\nname = "tokio"\nversion = "1.0.0"\n',
        'npm',
        'cargo',
      )
      expect(result.ecosystem).toBe('cargo')
      expect(result.packages[0]!.name).toBe('tokio')
    })
  })

  describe('parseLockfile (auto-sniff)', () => {
    it('auto-sniffs an npm lockfile', () => {
      const result = parseLockfile(
        JSON.stringify({
          lockfileVersion: 3,
          packages: { 'node_modules/x': { version: '1.0.0' } },
        }),
        'npm',
      )
      expect(result.packages[0]!.name).toBe('x')
    })
  })

  describe('errors', () => {
    it('throws ManifestError(ERR_UNSUPPORTED) for unknown ecosystems', () => {
      try {
        parseLockfile('', 'composer' as 'npm')
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(ManifestError)
        expect((e as ManifestError).code).toBe('ERR_UNSUPPORTED')
      }
    })

    it('throws ManifestError(ERR_UNKNOWN_FORMAT) when no format detected', () => {
      try {
        parseLockfile('no markers here', 'npm')
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(ManifestError)
        expect((e as ManifestError).code).toBe('ERR_UNKNOWN_FORMAT')
      }
    })
  })
})
