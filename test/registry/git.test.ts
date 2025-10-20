/**
 * @fileoverview Unit tests for git utility functions.
 */

import path from 'node:path'
import {
  findGitRoot,
  getChangedFiles,
  getChangedFilesSync,
  getStagedFiles,
  getStagedFilesSync,
  getUnstagedFiles,
  getUnstagedFilesSync,
  isChanged,
  isChangedSync,
  isStaged,
  isStagedSync,
  isUnstaged,
  isUnstagedSync,
} from '@socketsecurity/lib/git'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock spawn utilities - must be before imports
vi.mock('@socketsecurity/lib/spawn', () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}))

// Import after vi.mock
import * as spawnModule from '@socketsecurity/lib/spawn'

const { spawn, spawnSync } = spawnModule

describe('git', () => {
  // Use actual project root for real tests
  const projectRoot = process.cwd()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findGitRoot', () => {
    it('should find git root from current directory', () => {
      const result = findGitRoot(projectRoot)
      // Should find the actual .git directory in project root
      expect(result).toBe(projectRoot)
    })

    it('should find git root from subdirectory', () => {
      const testDir = path.join(projectRoot, 'test', 'registry')
      const result = findGitRoot(testDir)
      // Should walk up and find project root
      expect(result).toBe(projectRoot)
    })

    it('should return original path if no .git found', () => {
      // Use a path that doesn't exist, so no .git will be found
      const nonExistentPath = path.join(
        projectRoot,
        'nonexistent',
        'deep',
        'path',
      )
      const result = findGitRoot(nonExistentPath)
      // Should return original path when no .git found
      expect(result).toBe(nonExistentPath)
    })

    it('should handle nested source directories', () => {
      const srcDir = path.join(projectRoot, 'src')
      const result = findGitRoot(srcDir)
      expect(result).toBe(projectRoot)
    })
  })

  describe('getChangedFiles', () => {
    it('should return list of changed files from porcelain output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file1.ts\nA  file2.ts\n?? file3.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts', 'file3.ts'])
    })

    it('should handle various porcelain status codes', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(
          ' M modified.ts\nA  added.ts\nAM staged-and-modified.ts\nD  deleted.ts\n?? untracked.ts\n',
        ),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual([
        'modified.ts',
        'added.ts',
        'staged-and-modified.ts',
        'deleted.ts',
        'untracked.ts',
      ])
    })

    it('should return absolute paths when absolute option is true', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  src/file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ absolute: true, cwd: projectRoot })
      expect(result.length).toBeGreaterThan(0)
      expect(path.isAbsolute(result[0])).toBe(true)
      expect(result[0]).toContain('src/file.ts')
    })

    it('should handle custom cwd option', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['status', '--porcelain'],
        expect.objectContaining({
          cwd: projectRoot,
        }),
      )
      expect(result).toEqual(['file.ts'])
    })

    it('should return empty array on spawn error', async () => {
      vi.mocked(spawn).mockRejectedValue(new Error('git not found'))

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should handle empty git status output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should strip ANSI codes from output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('\x1b[31mM  file.ts\x1b[0m\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file.ts'])
    })

    it('should cache results by default', async () => {
      vi.mocked(spawn)
        .mockResolvedValueOnce({
          stdout: Buffer.from('M  file.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: Buffer.from('M  different.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })

      const result1 = await getChangedFiles({ cwd: projectRoot })
      const result2 = await getChangedFiles({ cwd: projectRoot })
      // Should return same cached result
      expect(result1).toEqual(result2)
      expect(result1).toEqual(['file.ts'])
      // Should only call spawn once due to caching
      expect(spawn).toHaveBeenCalledTimes(1)
    })

    it('should not cache when cache option is false', async () => {
      vi.mocked(spawn)
        .mockResolvedValueOnce({
          stdout: Buffer.from('M  file1.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: Buffer.from('M  file2.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })

      const result1 = await getChangedFiles({ cache: false, cwd: projectRoot })
      const result2 = await getChangedFiles({ cache: false, cwd: projectRoot })
      // Should return different results
      expect(result1).toEqual(['file1.ts'])
      expect(result2).toEqual(['file2.ts'])
      // Should call spawn twice
      expect(spawn).toHaveBeenCalledTimes(2)
    })

    it('should handle string stdout (not Buffer)', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: 'M  file.ts\n',
        stderr: '',
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file.ts'])
    })

    it('should handle files with spaces in names (quoted)', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  "file with spaces.ts"\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      // The function doesn't unquote, so it will preserve quotes
      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toContain('file with spaces.ts')
    })

    it('should filter empty lines from output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file1.ts\n\n\nM  file2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should trim trailing whitespace from lines', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file.ts   \n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file.ts'])
    })
  })

  describe('getChangedFilesSync', () => {
    it('should return list of changed files synchronously', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('M  file1.ts\nA  file2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = getChangedFilesSync({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should return empty array on spawn error', () => {
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('git not found')
      })

      const result = getChangedFilesSync({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should handle string stdout', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: 'M  file.ts\n',
        stderr: '',
        exitCode: 0,
      })

      const result = getChangedFilesSync({ cwd: projectRoot })
      expect(result).toEqual(['file.ts'])
    })

    it('should cache results by default', () => {
      vi.mocked(spawnSync)
        .mockReturnValueOnce({
          stdout: Buffer.from('M  file.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })
        .mockReturnValueOnce({
          stdout: Buffer.from('M  different.ts\n'),
          stderr: Buffer.from(''),
          exitCode: 0,
        })

      const result1 = getChangedFilesSync({ cwd: projectRoot })
      const result2 = getChangedFilesSync({ cwd: projectRoot })
      expect(result1).toEqual(result2)
      expect(spawnSync).toHaveBeenCalledTimes(1)
    })

    it('should handle absolute path option', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('M  src/file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = getChangedFilesSync({ absolute: true, cwd: projectRoot })
      expect(result.length).toBeGreaterThan(0)
      expect(path.isAbsolute(result[0])).toBe(true)
    })
  })

  describe('getUnstagedFiles', () => {
    it('should return list of unstaged files', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('file1.ts\nfile2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getUnstagedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only'],
        expect.any(Object),
      )
    })

    it('should return empty array on error', async () => {
      vi.mocked(spawn).mockRejectedValue(new Error('git error'))

      const result = await getUnstagedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should handle absolute option', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getUnstagedFiles({
        absolute: true,
        cwd: projectRoot,
      })
      expect(result.length).toBeGreaterThan(0)
      expect(path.isAbsolute(result[0])).toBe(true)
    })

    it('should handle empty output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getUnstagedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should not include porcelain status codes (plain file names)', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('src/file1.ts\nsrc/file2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getUnstagedFiles({ cwd: projectRoot })
      expect(result).toEqual(['src/file1.ts', 'src/file2.ts'])
    })
  })

  describe('getUnstagedFilesSync', () => {
    it('should return list of unstaged files synchronously', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('file1.ts\nfile2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = getUnstagedFilesSync({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should return empty array on error', () => {
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = getUnstagedFilesSync({ cwd: projectRoot })
      expect(result).toEqual([])
    })
  })

  describe('getStagedFiles', () => {
    it('should return list of staged files', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('file1.ts\nfile2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getStagedFiles({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['diff', '--cached', '--name-only'],
        expect.any(Object),
      )
    })

    it('should return empty array on error', async () => {
      vi.mocked(spawn).mockRejectedValue(new Error('git error'))

      const result = await getStagedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })

    it('should use shell on Windows', async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      })

      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      await getStagedFiles({ cwd: projectRoot })
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['diff', '--cached', '--name-only'],
        expect.objectContaining({
          shell: true,
        }),
      )

      // Restore original platform
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        writable: true,
        configurable: true,
      })
    })

    it('should handle empty output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getStagedFiles({ cwd: projectRoot })
      expect(result).toEqual([])
    })
  })

  describe('getStagedFilesSync', () => {
    it('should return list of staged files synchronously', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('file1.ts\nfile2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = getStagedFilesSync({ cwd: projectRoot })
      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should return empty array on error', () => {
      vi.mocked(spawnSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = getStagedFilesSync({ cwd: projectRoot })
      expect(result).toEqual([])
    })
  })

  describe('isChanged', () => {
    it('should return true if pathname is in changed files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  test/registry/git.test.ts\nM  src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isChanged(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in changed files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isChanged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })

    it('should handle files in subdirectories', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  src/lib/utils.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'src', 'lib', 'utils.ts')
      const result = await isChanged(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false when git returns empty', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'src', 'file.ts')
      const result = await isChanged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })

    it('should handle custom cwd option', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'file.ts')
      const result = await isChanged(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })
  })

  describe('isChangedSync', () => {
    it('should return true if pathname is in changed files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('M  test/registry/git.test.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isChangedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in changed files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('M  src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isChangedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })
  })

  describe('isUnstaged', () => {
    it('should return true if pathname is in unstaged files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('test/registry/git.test.ts\nsrc/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isUnstaged(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in unstaged files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isUnstaged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })

    it('should return false when no unstaged files', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'src', 'file.ts')
      const result = await isUnstaged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })
  })

  describe('isUnstagedSync', () => {
    it('should return true if pathname is in unstaged files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('test/registry/git.test.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isUnstagedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in unstaged files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isUnstagedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })
  })

  describe('isStaged', () => {
    it('should return true if pathname is in staged files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('test/registry/git.test.ts\nsrc/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isStaged(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in staged files list', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = await isStaged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })

    it('should return false when no staged files', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'src', 'file.ts')
      const result = await isStaged(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })
  })

  describe('isStagedSync', () => {
    it('should return true if pathname is in staged files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('test/registry/git.test.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isStagedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(true)
    })

    it('should return false if pathname is not in staged files list', () => {
      vi.mocked(spawnSync).mockReturnValue({
        stdout: Buffer.from('src/other.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const testFile = path.join(projectRoot, 'test', 'registry', 'git.test.ts')
      const result = isStagedSync(testFile, { cwd: projectRoot })
      expect(result).toBe(false)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle mixed line endings in output', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file1.ts\r\nM  file2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      // Should handle both \r\n and \n
      expect(result.length).toBeGreaterThan(0)
      expect(result).toContain('file1.ts')
      expect(result).toContain('file2.ts')
    })

    it('should handle output with only whitespace lines', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file1.ts\n   \nM  file2.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      // Should filter out whitespace-only lines
      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should handle very long file paths', async () => {
      const longPath =
        'very/deep/nested/directory/structure/with/many/levels/file.ts'
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from(`M  ${longPath}\n`),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result).toEqual([longPath])
    })

    it('should handle special characters in filenames', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  "file-with-special-chars-@#$.ts"\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      const result = await getChangedFiles({ cwd: projectRoot })
      expect(result.length).toBeGreaterThan(0)
    })

    it('should handle concurrent calls with caching', async () => {
      vi.mocked(spawn).mockResolvedValue({
        stdout: Buffer.from('M  file.ts\n'),
        stderr: Buffer.from(''),
        exitCode: 0,
      })

      // Call multiple times concurrently
      const results = await Promise.all([
        getChangedFiles({ cwd: projectRoot }),
        getChangedFiles({ cwd: projectRoot }),
        getChangedFiles({ cwd: projectRoot }),
      ])

      // All should return same result
      expect(results[0]).toEqual(results[1])
      expect(results[1]).toEqual(results[2])
    })
  })
})
