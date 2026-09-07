/**
 * @file Unit tests for Socket Registry type definitions.
 */

import { describe, expect, expectTypeOf, it } from 'vitest'

import { PURL_Type } from '../../../src/eco/purl.mjs'

describe('types', () => {
  describe('PURL_Type enum', () => {
    it('preserves uppercase keys and their exact lowercase literal types', () => {
      expectTypeOf(PURL_Type.NPM).toEqualTypeOf<'npm'>()
      expectTypeOf(PURL_Type.COCOAPODS).toEqualTypeOf<'cocoapods'>()
      for (const [key, value] of Object.entries(PURL_Type)) {
        expect(key).toBe(key.toUpperCase())
        expect(value).toBe(key.toLowerCase())
      }
    })

    it('should have NPM type', () => {
      expect(PURL_Type.NPM).toBe('npm')
    })

    it('should have common package types', () => {
      expect(PURL_Type.NPM).toBe('npm')
      expect(PURL_Type.PYPI).toBe('pypi')
      expect(PURL_Type.MAVEN).toBe('maven')
      expect(PURL_Type.GEM).toBe('gem')
      expect(PURL_Type.CARGO).toBe('cargo')
      expect(PURL_Type.GOLANG).toBe('golang')
    })

    it('should have container-related types', () => {
      expect(PURL_Type.DOCKER).toBe('docker')
      expect(PURL_Type.OCI).toBe('oci')
    })

    it('should have VCS types', () => {
      expect(PURL_Type.GITHUB).toBe('github')
      expect(PURL_Type.BITBUCKET).toBe('bitbucket')
      expect(PURL_Type.VCS).toBe('vcs')
    })

    it('should contain expected number of types', () => {
      const types = Object.keys(PURL_Type)
      expect(types.length).toBeGreaterThanOrEqual(25)
    })
  })
})
