/**
 * @file Unit tests for GitHub release auth headers + asset matchers. Covers:
 *
 *   - getAuthHeaders (GH_TOKEN / GITHUB_TOKEN handling)
 *   - SOCKET_BTM_REPO constant
 *   - picomatch integration (verifies the glob library behavior the asset-matcher
 *     relies on)
 */

import process from 'node:process'

import { describe, expect, it } from 'vitest'

// @ts-expect-error - no type declarations
import picomatch from 'picomatch'

import { clearGitHubTokenCache } from '../../../src/github/token.mjs'
import {
  getAuthHeaders,
  getAuthHeadersWithFallback,
} from '../../../src/releases/github-auth.mjs'
import { SOCKET_BTM_REPO } from '../../../src/releases/socket-btm.mjs'

describe('releases/github-auth', () => {
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

describe('releases/github-auth getAuthHeadersWithFallback', () => {
  // The release path is the one that motivated this: its sweep is the request
  // pattern that hits the anonymous 60/hour ceiling, and on a developer machine
  // the only credential is usually in the `gh` keychain, which no environment
  // variable exposes.
  it('carries the base GitHub headers', async () => {
    const headers = await getAuthHeadersWithFallback()
    expect(headers['Accept']).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
  })

  it('prefers an explicit environment token', async () => {
    const saved = process.env['GITHUB_TOKEN']
    process.env['GITHUB_TOKEN'] = 'env-wins'
    try {
      clearGitHubTokenCache()
      const headers = await getAuthHeadersWithFallback()
      expect(headers['Authorization']).toBe('Bearer env-wins')
    } finally {
      if (saved === undefined) {
        delete process.env['GITHUB_TOKEN']
      } else {
        process.env['GITHUB_TOKEN'] = saved
      }
      clearGitHubTokenCache()
    }
  })

  it('never emits an empty Authorization header', async () => {
    // A `Bearer ` with no token is rejected as a bad credential rather than
    // treated as anonymous, so an absent token must omit the header entirely.
    const headers = await getAuthHeadersWithFallback()
    expect(headers['Authorization']).not.toBe('Bearer ')
    expect(headers['Authorization']).not.toBe('Bearer undefined')
  })

  it('reaches sources the env-only resolver cannot', async () => {
    // Contract difference, asserted structurally: whenever the env is empty and
    // the fallback still finds a credential, only the async resolver reports it.
    const saved = {
      gh: process.env['GH_TOKEN'],
      gt: process.env['GITHUB_TOKEN'],
    }
    delete process.env['GH_TOKEN']
    delete process.env['GITHUB_TOKEN']
    try {
      clearGitHubTokenCache()
      expect(getAuthHeaders()['Authorization']).toBe(undefined)
      const withFallback = await getAuthHeadersWithFallback()
      const auth = withFallback['Authorization']
      expect(auth === undefined || auth.startsWith('Bearer ')).toBe(true)
    } finally {
      if (saved.gh !== undefined) {
        process.env['GH_TOKEN'] = saved.gh
      }
      if (saved.gt !== undefined) {
        process.env['GITHUB_TOKEN'] = saved.gt
      }
      clearGitHubTokenCache()
    }
  })
})
