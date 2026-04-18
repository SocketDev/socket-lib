/**
 * @fileoverview Unit tests for Socket Registry type definitions.
 */

import { describe, expect, it } from 'vitest'

import { PURL_Type } from '@socketsecurity/lib/types'

describe('types', () => {
  describe('PURL_Type enum', () => {
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
