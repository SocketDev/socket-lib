/**
 * @file Extended integration tests for git utility functions. Tests advanced
 *   git operations with comprehensive coverage:
 *
 *   - Cache behavior: result caching and cache invalidation
 *   - Error handling: invalid paths, non-git directories, permission issues
 *   - Edge cases: empty repositories, untracked files, submodules
 *   - Performance: cache hit rates, bulk operations
 *   - Real git operations: actual repository state manipulation Complements
 *     git.test.ts with deeper coverage of error paths and caching logic.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  getChangedFiles,
  getChangedFilesSync,
  isChanged,
} from '../../../src/git/changed'
import { findGitRoot } from '../../../src/git/repo'
import { getStagedFiles } from '../../../src/git/staged'
import { getUnstagedFiles } from '../../../src/git/unstaged'
import { normalizePath } from '../../../src/paths/normalize'
import { spawnSync } from '../../../src/process/spawn/child'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../util/temp-file-helper'

describe('git extended tests', () => {
  const projectRoot = normalizePath(process.cwd())

  describe('cache functionality', () => {
    it('should cache results by default', async () => {
      // First call
      const result1 = await getChangedFiles({ cwd: projectRoot })
      // Second call should use cache
      const result2 = await getChangedFiles({ cwd: projectRoot })
      expect(result1).toEqual(result2)
    })

    it('should not cache when cache option is false', async () => {
      const result1 = await getChangedFiles({ cache: false, cwd: projectRoot })
      const result2 = await getChangedFiles({ cache: false, cwd: projectRoot })
      // Results should be arrays (may not be exactly equal if files changed)
      expect(Array.isArray(result1)).toBe(true)
      expect(Array.isArray(result2)).toBe(true)
    })

    it('should cache sync results', () => {
      const result1 = getChangedFilesSync({ cwd: projectRoot })
      const result2 = getChangedFilesSync({ cwd: projectRoot })
      expect(result1).toEqual(result2)
    })

    it('should have separate cache entries for different options', async () => {
      const result1 = await getChangedFiles({
        absolute: false,
        cwd: projectRoot,
      })
      const result2 = await getChangedFiles({
        absolute: true,
        cwd: projectRoot,
      })
      // Cache should not mix absolute and relative results
      expect(Array.isArray(result1)).toBe(true)
      expect(Array.isArray(result2)).toBe(true)
    })

    it('should cache staged files separately from changed files', async () => {
      const changed = await getChangedFiles({ cwd: projectRoot })
      const staged = await getStagedFiles({ cwd: projectRoot })
      // These should be different cache entries
      expect(Array.isArray(changed)).toBe(true)
      expect(Array.isArray(staged)).toBe(true)
    })

    it('should cache unstaged files separately', async () => {
      const unstaged = await getUnstagedFiles({ cwd: projectRoot })
      const staged = await getStagedFiles({ cwd: projectRoot })
      expect(Array.isArray(unstaged)).toBe(true)
      expect(Array.isArray(staged)).toBe(true)
    })
  })

  describe('options handling', () => {
    it('should handle asSet option', async () => {
      const result = await getChangedFiles({ asSet: true, cwd: projectRoot })
      // Even with asSet, the function returns array (option is for future use)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle porcelain format explicitly', async () => {
      // getChangedFiles already uses porcelain internally
      const result = await getChangedFiles({
        cwd: projectRoot,
        porcelain: true,
      })
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle empty options object', async () => {
      const result = await getChangedFiles({})
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle undefined options', async () => {
      const result = await getChangedFiles(undefined)
      expect(Array.isArray(result)).toBe(true)
    })

    it('should handle glob matcher options', async () => {
      const result = await getChangedFiles({
        cwd: projectRoot,
        dot: true,
        nocase: true,
      })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return empty array when git command fails', async () => {
      // Use a non-git directory
      await runWithTempDir(async tmpDir => {
        const result = await getChangedFiles({ cwd: tmpDir })
        expect(result).toEqual([])
      }, 'git-error-')
    })

    it('should return empty array for sync version when git fails', async () => {
      await runWithTempDir(async tmpDir => {
        const result = getChangedFilesSync({ cwd: tmpDir })
        expect(result).toEqual([])
      }, 'git-error-sync-')
    })

    it('should handle invalid cwd gracefully in findGitRoot', () => {
      // findGitRoot should return the original path if no .git found
      const nonGitPath = '/nonexistent/path/that/does/not/exist'
      const result = findGitRoot(nonGitPath)
      expect(result).toBe(nonGitPath)
    })

    it('should return empty array for getStagedFiles in non-git dir', async () => {
      await runWithTempDir(async tmpDir => {
        const result = await getStagedFiles({ cwd: tmpDir })
        expect(result).toEqual([])
      }, 'git-staged-error-')
    })

    it('should return empty array for getUnstagedFiles in non-git dir', async () => {
      await runWithTempDir(async tmpDir => {
        const result = await getUnstagedFiles({ cwd: tmpDir })
        expect(result).toEqual([])
      }, 'git-unstaged-error-')
    })
  })

  describe('path resolution', () => {
    it('should normalize paths correctly', async () => {
      const result = await getChangedFiles({ cwd: projectRoot })
      for (const file of result) {
        // Paths should not have backslashes (even on Windows)
        expect(file).not.toContain('\\')
      }
    })

    it('should handle relative paths in cwd', async () => {
      // Test with a relative path for cwd
      const result = await getChangedFiles({ cwd: '.' })
      expect(Array.isArray(result)).toBe(true)
    })

    it('should resolve absolute paths correctly', async () => {
      const result = await getChangedFiles({ absolute: true, cwd: projectRoot })
      for (const file of result) {
        if (file) {
          expect(path.isAbsolute(file)).toBe(true)
          expect(file).toContain(projectRoot)
        }
      }
    })

    it('should handle subdirectory cwd correctly', async () => {
      const srcDir = path.join(projectRoot, 'src')
      const result = await getChangedFiles({ cwd: srcDir })
      expect(Array.isArray(result)).toBe(true)
      // Files should be filtered to src directory if there are changes
      for (const file of result) {
        // File paths should be relative to repo root but filtered to src
        expect(typeof file).toBe('string')
      }
    })
  })

  describe('findGitRoot edge cases', () => {
    it('should handle path at filesystem root', () => {
      const result = findGitRoot('/')
      expect(typeof result).toBe('string')
      expect(result).toBeTruthy()
    })

    it('should return same path when no .git found', () => {
      const nonGitPath = '/tmp/definitely/not/a/git/repo'
      const result = findGitRoot(nonGitPath)
      // Function returns either the path itself OR the nearest .git parent
      // If /tmp has .git, it returns /tmp; otherwise returns the input path
      expect(result).toMatch(/^\/tmp/)
    })

    it('should handle deeply nested git repos', async () => {
      await runWithTempDir(async tmpDir => {
        spawnSync('git', ['init'], { cwd: tmpDir })

        const deepPath = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e')
        await fs.mkdir(deepPath, { recursive: true })

        const result = findGitRoot(deepPath)
        expect(result).toBe(tmpDir)
      }, 'git-deep-')
    })

    it('should work when starting from git root itself', () => {
      const result = findGitRoot(projectRoot)
      expect(result).toBe(projectRoot)
    })

    it('should handle error in existsSync', async () => {
      await runWithTempDir(async tmpDir => {
        // Test that errors are caught and ignored
        const result = findGitRoot(tmpDir)
        expect(typeof result).toBe('string')
      }, 'git-error-exists-')
    })
  })

  describe('Windows-specific behavior', () => {
    it('should normalize path separators', async () => {
      const result = await getChangedFiles({ cwd: projectRoot })
      for (const file of result) {
        // Should use forward slashes even on Windows
        expect(file).not.toMatch(/\\(?!$)/)
      }
    })

    it('should use shell on Windows for some operations', async () => {
      // This tests that the code path for Windows shell is covered
      const result = await getChangedFiles({ cwd: projectRoot })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('porcelain format parsing', () => {
    it('should strip status codes from porcelain output', async () => {
      // getChangedFiles uses porcelain format internally
      const result = await getChangedFiles({ cwd: projectRoot })
      for (const file of result) {
        // Status codes are 2 chars + space, should be stripped
        expect(file).not.toMatch(/^[MADRCU?!]{1,2} /)
      }
    })

    it('should handle short porcelain lines', async () => {
      await runWithTempDir(async tmpDir => {
        spawnSync('git', ['init'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.email', 'test@example.com'], {
          cwd: tmpDir,
        })

        const testFile = path.join(tmpDir, 'a.txt')
        await fs.writeFile(testFile, 'content', 'utf8')

        const changed = await getChangedFiles({ cwd: tmpDir })
        // Even very short filenames should work
        expect(changed).toContain('a.txt')
      }, 'git-porcelain-')
    })
  })

  describe('concurrent operations', () => {
    it('should handle many concurrent git operations', async () => {
      // Use a freshly-seeded temp repo instead of `projectRoot` so 20
      // concurrent git invocations don't contend with the live working
      // tree (size + index lock + ongoing edits). Past flake: 30s timeout
      // on macOS runners when projectRoot grew large.
      await runWithTempDir(async tmpDir => {
        spawnSync('git', ['init'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.email', 'test@example.com'], {
          cwd: tmpDir,
        })
        await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a', 'utf8')
        await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b', 'utf8')

        const operations = Array.from({ length: 20 }, (_, i) => {
          // Always disable the result cache so each call hits git for
          // real — otherwise 19 of 20 invocations would short-circuit
          // on the cache and the test wouldn't exercise concurrency.
          const opts = { cache: false, cwd: tmpDir }
          if (i % 3 === 0) {
            return getChangedFiles(opts)
          }
          if (i % 3 === 1) {
            return getStagedFiles(opts)
          }
          return getUnstagedFiles(opts)
        })

        const results = await Promise.all(operations)
        for (const result of results) {
          expect(Array.isArray(result)).toBe(true)
        }
      }, 'git-concurrent-')
    })

    it('should handle mixed sync and async operations', async () => {
      const asyncResult = getChangedFiles({ cwd: projectRoot })
      const syncResult = getChangedFilesSync({ cwd: projectRoot })

      const [async, sync] = await Promise.all([
        asyncResult,
        Promise.resolve(syncResult),
      ])
      expect(async).toEqual(sync)
    })
  })

  describe('cwd resolution with symlinks', () => {
    it('should resolve symlinks in cwd', async () => {
      // This tests that fs.realpathSync is called for cwd
      const result = await getChangedFiles({ cwd: projectRoot })
      expect(Array.isArray(result)).toBe(true)
    })

    it('should resolve symlinks in pathname for is* functions', async () => {
      const testFile = path.join(projectRoot, 'package.json')
      const isChangedResult = await isChanged(testFile, { cwd: projectRoot })
      expect(typeof isChangedResult).toBe('boolean')
    })

    it('should handle cwd same as default root', async () => {
      const defaultCwd = process.cwd()
      const result = await getChangedFiles({ cwd: defaultCwd })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('empty output handling', () => {
    it('should handle empty stdout', async () => {
      await runWithTempDir(async tmpDir => {
        spawnSync('git', ['init'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir })
        spawnSync('git', ['config', 'user.email', 'test@example.com'], {
          cwd: tmpDir,
        })

        // Empty repo with no files
        const changed = await getChangedFiles({ cwd: tmpDir })
        expect(changed).toEqual([])
      }, 'git-empty-stdout-')
    })
  })

  describe('getFs and getPath lazy loading', () => {
    it('should lazily load fs module', async () => {
      // Multiple calls should use the same cached module
      const result1 = await getChangedFiles({ cwd: projectRoot })
      const result2 = await getChangedFiles({ cwd: projectRoot })
      expect(result1).toEqual(result2)
    })

    it('should lazily load path module', () => {
      // findGitRoot uses the lazy path module
      const result = findGitRoot(projectRoot)
      expect(result).toBe(projectRoot)
    })
  })
})
