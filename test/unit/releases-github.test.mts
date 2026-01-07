/**
 * @fileoverview Unit tests for GitHub release download utilities.
 */

import { describe, expect, it } from 'vitest'

import picomatch from 'picomatch'

import {
  getAuthHeaders,
  SOCKET_BTM_REPO,
} from '@socketsecurity/lib/releases/github'

describe('releases/github', () => {
  describe('SOCKET_BTM_REPO', () => {
    it('should export socket-btm repository config', () => {
      expect(SOCKET_BTM_REPO).toEqual({
        owner: 'SocketDev',
        repo: 'socket-btm',
      })
    })
  })

  describe('getAuthHeaders', () => {
    it('should return headers with Accept and API version', () => {
      const headers = getAuthHeaders()
      expect(headers['Accept']).toBe('application/vnd.github+json')
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    })

    it('should include Authorization header when GH_TOKEN is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GITHUB_TOKEN']
        process.env['GH_TOKEN'] = 'test-token-123'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer test-token-123')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        } else {
          delete process.env['GH_TOKEN']
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        }
      }
    })

    it('should include Authorization header when GITHUB_TOKEN is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GH_TOKEN']
        process.env['GITHUB_TOKEN'] = 'github-token-456'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer github-token-456')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        } else {
          delete process.env['GITHUB_TOKEN']
        }
      }
    })

    it('should prefer GH_TOKEN over GITHUB_TOKEN', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        process.env['GH_TOKEN'] = 'gh-token'
        process.env['GITHUB_TOKEN'] = 'github-token'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer gh-token')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        } else {
          delete process.env['GH_TOKEN']
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        } else {
          delete process.env['GITHUB_TOKEN']
        }
      }
    })

    it('should not include Authorization header when no token is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GH_TOKEN']
        delete process.env['GITHUB_TOKEN']

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBeUndefined()
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        }
      }
    })
  })

  describe('picomatch integration', () => {
    it('should match simple wildcard patterns', () => {
      const isMatch = picomatch('yoga-sync-*.mjs')
      expect(isMatch('yoga-sync-abc123.mjs')).toBe(true)
      expect(isMatch('yoga-sync-2024-01-15.mjs')).toBe(true)
      expect(isMatch('models-xyz.tar.gz')).toBe(false)
      expect(isMatch('yoga-sync.js')).toBe(false)
    })

    it('should match patterns with multiple wildcards', () => {
      const isMatch = picomatch('models-*-*.tar.gz')
      expect(isMatch('models-2024-01-15.tar.gz')).toBe(true)
      expect(isMatch('models-foo-bar.tar.gz')).toBe(true)
      expect(isMatch('models-xyz.tar.gz')).toBe(false)
    })

    it('should match patterns with braces', () => {
      const isMatch = picomatch('yoga-{sync,layout}-*.{mjs,js}')
      expect(isMatch('yoga-sync-abc.mjs')).toBe(true)
      expect(isMatch('yoga-layout-xyz.js')).toBe(true)
      expect(isMatch('yoga-sync-abc.ts')).toBe(false)
      expect(isMatch('yoga-other-xyz.mjs')).toBe(false)
    })

    it('should match exact patterns without wildcards', () => {
      const isMatch = picomatch('exact-name.txt')
      expect(isMatch('exact-name.txt')).toBe(true)
      expect(isMatch('exact-name.md')).toBe(false)
      expect(isMatch('other-name.txt')).toBe(false)
    })

    it('should match patterns starting with wildcard', () => {
      const isMatch = picomatch('*-models.tar.gz')
      expect(isMatch('foo-models.tar.gz')).toBe(true)
      expect(isMatch('bar-models.tar.gz')).toBe(true)
      expect(isMatch('models.tar.gz')).toBe(false)
    })

    it('should match patterns ending with wildcard', () => {
      const isMatch = picomatch('yoga-*')
      expect(isMatch('yoga-sync')).toBe(true)
      expect(isMatch('yoga-layout')).toBe(true)
      expect(isMatch('yoga-')).toBe(true)
      expect(isMatch('models-sync')).toBe(false)
    })

    it('should support double-star globstar patterns', () => {
      const isMatch = picomatch('**/*.mjs')
      expect(isMatch('yoga-sync.mjs')).toBe(true)
      expect(isMatch('dir/yoga-sync.mjs')).toBe(true)
      expect(isMatch('deep/nested/dir/file.mjs')).toBe(true)
      expect(isMatch('file.js')).toBe(false)
    })

    it('should be case-sensitive by default', () => {
      const isMatch = picomatch('yoga-sync-*.mjs')
      expect(isMatch('yoga-sync-ABC.mjs')).toBe(true)
      expect(isMatch('Yoga-Sync-abc.mjs')).toBe(false)
      expect(isMatch('YOGA-SYNC-abc.MJS')).toBe(false)
    })
  })
})
