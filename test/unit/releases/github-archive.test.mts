/**
 * @fileoverview Unit tests for GitHub release archive utilities.
 *
 * Tests archive-related utilities in releases/github module:
 * - Format auto-detection from file patterns
 * - Integration with archive extraction (tested via archive tests)
 *
 * Note: Full download tests are in integration tests due to GitHub API dependency.
 */

import { describe, expect, it } from 'vitest'

import { detectArchiveFormat } from '@socketsecurity/lib-stable/archives/detect'
import {
  downloadAndExtractArchive,
  downloadAndExtractZip,
} from '@socketsecurity/lib-stable/releases/github-archives'

describe('releases-github-archive', () => {
  describe('archive format detection', () => {
    it('should detect zip format from asset name', () => {
      expect(detectArchiveFormat('release.zip')).toBe('zip')
      expect(detectArchiveFormat('package-v1.0.0.zip')).toBe('zip')
    })

    it('should detect tar format from asset name', () => {
      expect(detectArchiveFormat('release.tar')).toBe('tar')
      expect(detectArchiveFormat('package-v1.0.0.tar')).toBe('tar')
    })

    it('should detect tar.gz format from asset name', () => {
      expect(detectArchiveFormat('release.tar.gz')).toBe('tar.gz')
      expect(detectArchiveFormat('package-v1.0.0.tar.gz')).toBe('tar.gz')
    })

    it('should detect tgz format from asset name', () => {
      expect(detectArchiveFormat('release.tgz')).toBe('tgz')
      expect(detectArchiveFormat('package-v1.0.0.tgz')).toBe('tgz')
    })

    it('should return undefined for unsupported formats', () => {
      expect(detectArchiveFormat('release.exe')).toBeUndefined()
      expect(detectArchiveFormat('release.dmg')).toBeUndefined()
      expect(detectArchiveFormat('release')).toBeUndefined()
    })
  })

  describe('downloadAndExtractZip integration', () => {
    it('should be exported for backward compatibility', () => {
      expect(typeof downloadAndExtractZip).toBe('function')
    })
  })

  describe('downloadAndExtractArchive integration', () => {
    it('should be exported for all archive formats', () => {
      expect(typeof downloadAndExtractArchive).toBe('function')
    })
  })
})
