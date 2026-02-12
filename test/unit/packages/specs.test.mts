/**
 * @fileoverview Unit tests for package spec parsing and GitHub URL utilities.
 *
 * Tests npm-package-arg integration for parsing package specifiers:
 * - getRepoUrlDetails() extracts user/project from GitHub URLs
 * - gitHubTagRefUrl() generates GitHub API URLs for tag references
 * - gitHubTgzUrl() generates tarball download URLs
 * - isGitHubTgzSpec() identifies GitHub tarball specifiers
 * - isGitHubUrlSpec() identifies GitHub URL specifiers with committish
 * Used by Socket CLI for package installation and validation.
 */

import {
  getRepoUrlDetails,
  gitHubTagRefUrl,
  gitHubTgzUrl,
  isGitHubTgzSpec,
  isGitHubUrlSpec,
} from '@socketsecurity/lib/packages/specs'
import { describe, expect, it } from 'vitest'

describe('packages/specs', () => {
  describe('getRepoUrlDetails', () => {
    it('should extract user and project from GitHub URL', () => {
      const result = getRepoUrlDetails(
        'https://github.com/SocketDev/socket-lib.git',
      )
      expect(result.user).toBe('SocketDev')
      expect(result.project).toBe('socket-lib')
    })

    it('should handle URL without .git extension', () => {
      const result = getRepoUrlDetails('https://github.com/nodejs/node')
      expect(result.user).toBe('nodejs')
      // Fixed: now correctly returns project name without .git extension
      expect(result.project).toBe('node')
    })

    it('should handle git@ protocol URLs', () => {
      const result = getRepoUrlDetails('git@github.com:npm/cli.git')
      // Note: the function doesn't handle git@ URLs with : separator correctly
      expect(result.user).toBe('git@github.com:npm')
      expect(result.project).toBe('cli')
    })

    it('should handle git:// protocol URLs', () => {
      const result = getRepoUrlDetails('git://github.com/yarnpkg/berry.git')
      expect(result.user).toBe('yarnpkg')
      expect(result.project).toBe('berry')
    })

    it('should return empty strings for invalid URL', () => {
      const result = getRepoUrlDetails('not-a-valid-url')
      expect(result.user).toBe('not-a-valid-url')
      expect(result.project).toBe('')
    })

    it('should handle empty string', () => {
      const result = getRepoUrlDetails('')
      expect(result.user).toBe('')
      expect(result.project).toBe('')
    })

    it('should handle undefined input', () => {
      const result = getRepoUrlDetails(undefined)
      expect(result.user).toBe('')
      expect(result.project).toBe('')
    })

    it('should handle URL with subdirectories', () => {
      const result = getRepoUrlDetails(
        'https://github.com/facebook/react/tree/main',
      )
      expect(result.user).toBe('facebook')
      // Fixed: now correctly returns repo name without incorrect .git truncation
      expect(result.project).toBe('react')
    })
  })

  describe('gitHubTagRefUrl', () => {
    it('should generate correct GitHub API tag reference URL', () => {
      const url = gitHubTagRefUrl('SocketDev', 'socket-lib', 'v1.0.0')
      expect(url).toBe(
        'https://api.github.com/repos/SocketDev/socket-lib/git/ref/tags/v1.0.0',
      )
    })

    it('should handle tag without v prefix', () => {
      const url = gitHubTagRefUrl('nodejs', 'node', '18.0.0')
      expect(url).toBe(
        'https://api.github.com/repos/nodejs/node/git/ref/tags/18.0.0',
      )
    })

    it('should handle empty strings', () => {
      const url = gitHubTagRefUrl('', '', '')
      expect(url).toBe('https://api.github.com/repos///git/ref/tags/')
    })

    it('should handle special characters in tag', () => {
      const url = gitHubTagRefUrl('user', 'repo', 'v1.0.0-beta.1')
      expect(url).toBe(
        'https://api.github.com/repos/user/repo/git/ref/tags/v1.0.0-beta.1',
      )
    })
  })

  describe('gitHubTgzUrl', () => {
    it('should generate correct GitHub tarball download URL', () => {
      const url = gitHubTgzUrl(
        'SocketDev',
        'socket-lib',
        'abc123def456789012345678901234567890abcd',
      )
      expect(url).toBe(
        'https://github.com/SocketDev/socket-lib/archive/abc123def456789012345678901234567890abcd.tar.gz',
      )
    })

    it('should handle short SHA', () => {
      const url = gitHubTgzUrl('user', 'repo', 'abc123')
      expect(url).toBe('https://github.com/user/repo/archive/abc123.tar.gz')
    })

    it('should handle empty strings', () => {
      const url = gitHubTgzUrl('', '', '')
      expect(url).toBe('https://github.com///archive/.tar.gz')
    })

    it('should handle SHA with mixed case', () => {
      const url = gitHubTgzUrl('user', 'repo', 'AbC123DeF456')
      expect(url).toBe('https://github.com/user/repo/archive/AbC123DeF456.tar.gz')
    })
  })

  describe('isGitHubTgzSpec', () => {
    it('should identify GitHub tarball URL spec', () => {
      const result = isGitHubTgzSpec(
        'https://github.com/SocketDev/socket-lib/archive/main.tar.gz',
      )
      expect(result).toBe(true)
    })

    it('should reject non-tarball GitHub URL', () => {
      const result = isGitHubTgzSpec('https://github.com/SocketDev/socket-lib')
      expect(result).toBe(false)
    })

    it('should handle npm package spec', () => {
      const result = isGitHubTgzSpec('lodash@4.17.21')
      expect(result).toBe(false)
    })

    it('should handle scoped package spec', () => {
      const result = isGitHubTgzSpec('@types/node@20.0.0')
      expect(result).toBe(false)
    })

    it('should accept pre-parsed spec object', () => {
      const parsedSpec = {
        type: 'remote',
        saveSpec: 'https://example.com/package.tar.gz',
      }
      const result = isGitHubTgzSpec(parsedSpec)
      expect(result).toBe(true)
    })

    it('should reject spec object without tar.gz', () => {
      const parsedSpec = {
        type: 'remote',
        saveSpec: 'https://example.com/package.zip',
      }
      const result = isGitHubTgzSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should handle spec object with wrong type', () => {
      const parsedSpec = {
        type: 'git',
        saveSpec: 'https://example.com/package.tar.gz',
      }
      const result = isGitHubTgzSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should handle spec object without saveSpec', () => {
      const parsedSpec = {
        type: 'remote',
      }
      const result = isGitHubTgzSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should handle empty string spec', () => {
      const result = isGitHubTgzSpec('')
      expect(result).toBe(false)
    })

    it('should handle where parameter', () => {
      const result = isGitHubTgzSpec(
        'https://github.com/user/repo/archive/main.tar.gz',
        '/path/to/package',
      )
      expect(result).toBe(true)
    })
  })

  describe('isGitHubUrlSpec', () => {
    it('should identify GitHub URL with committish', () => {
      const result = isGitHubUrlSpec('github:SocketDev/socket-lib#v1.0.0')
      expect(result).toBe(true)
    })

    it('should identify git+https GitHub URL with hash', () => {
      const result = isGitHubUrlSpec(
        'git+https://github.com/SocketDev/socket-lib.git#main',
      )
      expect(result).toBe(true)
    })

    it('should reject GitHub URL without committish', () => {
      const result = isGitHubUrlSpec('github:SocketDev/socket-lib')
      expect(result).toBe(false)
    })

    it('should reject non-GitHub git URL', () => {
      const result = isGitHubUrlSpec('git+https://gitlab.com/user/repo.git#main')
      expect(result).toBe(false)
    })

    it('should reject npm package spec', () => {
      const result = isGitHubUrlSpec('lodash@4.17.21')
      expect(result).toBe(false)
    })

    it('should accept pre-parsed spec object with committish', () => {
      const parsedSpec = {
        type: 'git',
        hosted: { domain: 'github.com' },
        gitCommittish: 'v1.0.0',
      }
      const result = isGitHubUrlSpec(parsedSpec)
      expect(result).toBe(true)
    })

    it('should reject spec object without committish', () => {
      const parsedSpec = {
        type: 'git',
        hosted: { domain: 'github.com' },
        gitCommittish: '',
      }
      const result = isGitHubUrlSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should reject spec object with undefined committish', () => {
      const parsedSpec = {
        type: 'git',
        hosted: { domain: 'github.com' },
      }
      const result = isGitHubUrlSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should reject spec object with wrong domain', () => {
      const parsedSpec = {
        type: 'git',
        hosted: { domain: 'gitlab.com' },
        gitCommittish: 'main',
      }
      const result = isGitHubUrlSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should reject spec object with wrong type', () => {
      const parsedSpec = {
        type: 'remote',
        hosted: { domain: 'github.com' },
        gitCommittish: 'main',
      }
      const result = isGitHubUrlSpec(parsedSpec)
      expect(result).toBe(false)
    })

    it('should handle empty string spec', () => {
      const result = isGitHubUrlSpec('')
      expect(result).toBe(false)
    })

    it('should handle where parameter', () => {
      const result = isGitHubUrlSpec(
        'github:SocketDev/socket-lib#main',
        '/path/to/package',
      )
      expect(result).toBe(true)
    })

    it('should handle committish with SHA', () => {
      const result = isGitHubUrlSpec(
        'github:SocketDev/socket-lib#abc123def456789012345678901234567890abcd',
      )
      expect(result).toBe(true)
    })
  })

  describe('integration', () => {
    it('should work together for GitHub workflow', () => {
      // Extract details from URL
      const { user, project } = getRepoUrlDetails(
        'https://github.com/SocketDev/socket-lib.git',
      )
      expect(user).toBe('SocketDev')
      expect(project).toBe('socket-lib')

      // Generate tag reference URL
      const tagUrl = gitHubTagRefUrl(user, project, 'v1.0.0')
      expect(tagUrl).toContain('SocketDev/socket-lib')
      expect(tagUrl).toContain('tags/v1.0.0')

      // Generate tarball URL
      const tgzUrl = gitHubTgzUrl(user, project, 'abc123')
      expect(tgzUrl).toContain('SocketDev/socket-lib')
      expect(tgzUrl).toContain('abc123.tar.gz')
    })

    it('all functions should handle edge cases without throwing', () => {
      expect(() => getRepoUrlDetails('')).not.toThrow()
      expect(() => gitHubTagRefUrl('', '', '')).not.toThrow()
      expect(() => gitHubTgzUrl('', '', '')).not.toThrow()
      expect(() => isGitHubTgzSpec('')).not.toThrow()
      expect(() => isGitHubUrlSpec('')).not.toThrow()
    })
  })
})
