/**
 * @fileoverview Unit tests for src/eco/manifest/detect-format.ts.
 *
 * On stock Node the JS impl is exercised; on socket-btm's smol binary
 * the native `detectFormat` is exercised. Both paths return the same
 * shapes, so these assertions hold either way.
 */

import { describe, expect, it } from 'vitest'

import {
  detectFormat,
  supportedFiles,
} from '@socketsecurity/lib-stable/eco/manifest/detect-format'

describe('eco/manifest/detect-format', () => {
  describe('detectFormat', () => {
    it('returns the npm manifest descriptor for package.json', () => {
      expect(detectFormat('package.json')).toMatchObject({
        ecosystem: 'npm',
        type: 'manifest',
      })
    })

    it('returns the npm lockfile descriptor for package-lock.json', () => {
      expect(detectFormat('package-lock.json')).toMatchObject({
        ecosystem: 'npm',
        format: 'npm',
        type: 'lockfile',
      })
    })

    it('treats npm-shrinkwrap.json as an npm lockfile', () => {
      expect(detectFormat('npm-shrinkwrap.json')).toMatchObject({
        ecosystem: 'npm',
        format: 'npm',
        type: 'lockfile',
      })
    })

    it('returns the yarn lockfile descriptor for yarn.lock', () => {
      expect(detectFormat('yarn.lock')).toMatchObject({
        ecosystem: 'npm',
        format: 'yarn',
        type: 'lockfile',
      })
    })

    it('returns the pnpm lockfile descriptor for pnpm-lock.yaml', () => {
      expect(detectFormat('pnpm-lock.yaml')).toMatchObject({
        ecosystem: 'npm',
        format: 'pnpm',
        type: 'lockfile',
      })
    })

    it('returns the composer manifest descriptor for composer.json', () => {
      expect(detectFormat('composer.json')).toMatchObject({
        ecosystem: 'composer',
        type: 'manifest',
      })
    })

    it('returns the composer lockfile descriptor for composer.lock', () => {
      expect(detectFormat('composer.lock')).toMatchObject({
        ecosystem: 'composer',
        format: 'composer',
        type: 'lockfile',
      })
    })

    it('strips the directory prefix before matching', () => {
      expect(detectFormat('/abs/path/package.json')).toMatchObject({
        ecosystem: 'npm',
        type: 'manifest',
      })
      expect(detectFormat('rel/path/yarn.lock')).toMatchObject({
        ecosystem: 'npm',
        format: 'yarn',
      })
    })

    it('returns undefined for unrecognized filenames', () => {
      expect(detectFormat('go.mod')).toBe(undefined)
      expect(detectFormat('README.md')).toBe(undefined)
      expect(detectFormat('')).toBe(undefined)
    })
  })

  describe('supportedFiles', () => {
    it('includes package.json among manifests', () => {
      expect(supportedFiles.manifests).toContain('package.json')
    })

    it('includes the npm + yarn + pnpm lockfile basenames', () => {
      expect(supportedFiles.lockfiles).toContain('package-lock.json')
      expect(supportedFiles.lockfiles).toContain('npm-shrinkwrap.json')
      expect(supportedFiles.lockfiles).toContain('yarn.lock')
      expect(supportedFiles.lockfiles).toContain('pnpm-lock.yaml')
    })
  })
})
