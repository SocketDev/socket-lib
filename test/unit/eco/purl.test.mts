/**
 * @file Unit tests for Socket Registry type definitions.
 */

import { describe, expect, it } from 'vitest'

import { PURL_TYPE } from '../../../src/eco/purl.mjs'

describe('types', () => {
  describe('PURL_TYPE enum', () => {
    it('should have NPM type', () => {
      expect(PURL_TYPE.npm).toBe('npm')
    })

    it('should have common package types', () => {
      expect(PURL_TYPE.npm).toBe('npm')
      expect(PURL_TYPE.pypi).toBe('pypi')
      expect(PURL_TYPE.maven).toBe('maven')
      expect(PURL_TYPE.gem).toBe('gem')
      expect(PURL_TYPE.cargo).toBe('cargo')
      expect(PURL_TYPE.golang).toBe('golang')
    })

    it('should have container-related types', () => {
      expect(PURL_TYPE.docker).toBe('docker')
      expect(PURL_TYPE.oci).toBe('oci')
    })

    it('should have VCS types', () => {
      expect(PURL_TYPE.github).toBe('github')
      expect(PURL_TYPE.bitbucket).toBe('bitbucket')
      expect(PURL_TYPE.vcs).toBe('vcs')
    })

    it('should contain expected number of types', () => {
      const types = Object.keys(PURL_TYPE)
      expect(types.length).toBeGreaterThanOrEqual(25)
    })
  })
})
