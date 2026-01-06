/**
 * @fileoverview Unit tests for Socket Registry type definitions.
 */

import { PURL_Type } from '@socketsecurity/lib/types'
import type {
  CategoryString,
  EcosystemString,
  InteropString,
  Manifest,
  ManifestEntry,
  ManifestEntryData,
  PURLString,
} from '@socketsecurity/lib/types'
import { describe, expect, it } from 'vitest'

describe('types', () => {
  describe('PURL_Type enum', () => {
    it('should export PURL_Type enum', () => {
      expect(PURL_Type).toBeDefined()
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

  describe('type definitions', () => {
    it('should accept valid CategoryString', () => {
      const category: CategoryString = 'cleanup'
      expect(category).toBe('cleanup')

      const categories: CategoryString[] = [
        'cleanup',
        'levelup',
        'speedup',
        'tuneup',
      ]
      expect(categories).toHaveLength(4)
    })

    it('should accept valid InteropString', () => {
      const interop: InteropString = 'esm'
      expect(interop).toBe('esm')

      const interops: InteropString[] = ['browserify', 'cjs', 'esm']
      expect(interops).toHaveLength(3)
    })

    it('should accept valid PURLString', () => {
      const purl: PURLString = 'npm'
      expect(purl).toBe('npm')
    })

    it('should accept EcosystemString as alias for PURLString', () => {
      const ecosystem: EcosystemString = 'npm'
      const purl: PURLString = ecosystem
      expect(purl).toBe('npm')
    })

    it('should accept valid ManifestEntryData', () => {
      const data: ManifestEntryData = {
        name: 'test-package',
        version: '1.0.0',
      }
      expect(data.name).toBe('test-package')
      expect(data.version).toBe('1.0.0')
    })

    it('should accept ManifestEntryData with optional fields', () => {
      const data: ManifestEntryData = {
        name: 'test-package',
        version: '1.0.0',
        categories: ['cleanup', 'speedup'],
        interop: 'esm',
        license: 'MIT',
      }
      expect(data.categories).toEqual(['cleanup', 'speedup'])
      expect(data.interop).toBe('esm')
      expect(data.license).toBe('MIT')
    })

    it('should accept ManifestEntryData with additional properties', () => {
      const data: ManifestEntryData = {
        name: 'test-package',
        version: '1.0.0',
        customField: 'custom value',
      }
      expect(data.customField).toBe('custom value')
    })

    it('should accept valid ManifestEntry tuple', () => {
      const entry: ManifestEntry = [
        'test-package',
        {
          name: 'test-package',
          version: '1.0.0',
        },
      ]
      expect(entry[0]).toBe('test-package')
      expect(entry[1].name).toBe('test-package')
    })

    it('should accept valid Manifest structure', () => {
      const manifest: Partial<Manifest> = {
        npm: [
          [
            'package-1',
            {
              name: 'package-1',
              version: '1.0.0',
              categories: ['cleanup'],
            },
          ],
          [
            'package-2',
            {
              name: 'package-2',
              version: '2.0.0',
              interop: 'esm',
            },
          ],
        ],
        pypi: [
          [
            'python-pkg',
            {
              name: 'python-pkg',
              version: '3.0.0',
            },
          ],
        ],
      }
      expect(manifest.npm).toHaveLength(2)
      expect(manifest.pypi).toHaveLength(1)
    })
  })
})
