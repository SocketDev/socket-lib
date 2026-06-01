/**
 * @file Unit tests for the `parse(filename, content)` entry.
 */

import { describe, expect, it } from 'vitest'

import type { ManifestError } from '../../../../src/eco/manifest/manifest-error'
import { parse } from '../../../../src/eco/manifest/parse'

describe('eco/manifest/parse', () => {
  it('routes a package.json filename to parseManifest', () => {
    const result = parse(
      'package.json',
      JSON.stringify({ name: 'foo', version: '1.0.0' }),
    )
    expect(result.type).toBe('manifest')
  })

  it('routes a package-lock.json filename to parseLockfile', () => {
    const result = parse(
      'package-lock.json',
      JSON.stringify({
        lockfileVersion: 3,
        packages: { 'node_modules/x': { version: '1.0.0' } },
      }),
    )
    expect(result.type).toBe('lockfile')
  })

  it('routes a yarn.lock filename to parseLockfile (yarn)', () => {
    const result = parse('yarn.lock', '"foo@^1":\n  version "1.0.0"\n')
    expect(result.type).toBe('lockfile')
    expect((result as { lockVersion: string }).lockVersion).toBe('1')
  })

  it('routes a pnpm-lock.yaml filename to parseLockfile (pnpm)', () => {
    const result = parse('pnpm-lock.yaml', "lockfileVersion: '9.0'\n")
    expect(result.type).toBe('lockfile')
  })

  it('strips directory prefix before format detection', () => {
    const result = parse(
      '/abs/path/package.json',
      JSON.stringify({ name: 'foo' }),
    )
    expect(result.type).toBe('manifest')
  })

  it('throws ManifestError(ERR_UNKNOWN_FORMAT) for unrecognized filename', () => {
    try {
      parse('mystery.txt', '{}')
      expect.fail('should have thrown')
    } catch (e) {
      expect((e as Error).name).toBe('ManifestError')
      expect((e as ManifestError).code).toBe('ERR_UNKNOWN_FORMAT')
    }
  })
})
