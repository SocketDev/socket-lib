/**
 * @fileoverview Integration tests for git utilities.
 *
 * Tests real git operations in temporary repositories:
 * - getGitRoot() finds repository root
 * - isGitRepo() checks if directory is a git repo
 * - getCurrentBranch() gets active branch name
 * - getGitRemoteUrl() retrieves remote URL
 * Used by Socket CLI for repository detection and git operations.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { findGitRoot } from '@socketsecurity/lib/git'
import { spawn } from '@socketsecurity/lib/spawn'
import { describe, expect, it } from 'vitest'
import { runWithTempDir } from '../unit/utils/temp-file-helper.mjs'

describe('git integration', () => {
  describe('repository detection', () => {
    it('should find git root from current directory', () => {
      // This test runs in socket-lib which is a git repo
      const gitRoot = findGitRoot(process.cwd())
      expect(gitRoot).toBeDefined()
      expect(gitRoot).toContain('socket-lib')
    })

    it('should return original path for non-git directory', async () => {
      await runWithTempDir(async tmpDir => {
        // findGitRoot returns the original path if no .git found
        const result = findGitRoot(tmpDir)
        expect(result).toBe(tmpDir)
      }, 'git-non-repo-')
    })
  })

  describe('git repository operations', () => {
    it('should initialize git repo and find root', async () => {
      await runWithTempDir(async tmpDir => {
        // Initialize git repo
        await spawn('git', ['init'], { cwd: tmpDir })

        const gitRoot = findGitRoot(tmpDir)
        expect(gitRoot).toBe(tmpDir)
      }, 'git-init-test-')
    })

    it('should get current branch name via spawn', async () => {
      await runWithTempDir(async tmpDir => {
        // Initialize git repo and create initial commit
        await spawn('git', ['init'], { cwd: tmpDir })
        await spawn('git', ['config', 'user.email', 'test@example.com'], {
          cwd: tmpDir,
        })
        await spawn('git', ['config', 'user.name', 'Test User'], {
          cwd: tmpDir,
        })

        // Create a file and commit
        await fs.writeFile(path.join(tmpDir, 'test.txt'), 'content', 'utf8')
        await spawn('git', ['add', '.'], { cwd: tmpDir })
        await spawn('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir })

        const result = await spawn('git', ['branch', '--show-current'], {
          cwd: tmpDir,
        })
        expect(result.stdout.toString().trim()).toMatch(/^(main|master)$/)
      }, 'git-branch-test-')
    })

    it('should get git remote URL via spawn', async () => {
      await runWithTempDir(async tmpDir => {
        // Initialize git repo
        await spawn('git', ['init'], { cwd: tmpDir })

        // Add remote
        await spawn(
          'git',
          ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
          { cwd: tmpDir },
        )

        const result = await spawn('git', ['remote', 'get-url', 'origin'], {
          cwd: tmpDir,
        })
        expect(result.stdout.toString().trim()).toBe(
          'https://github.com/test/repo.git',
        )
      }, 'git-remote-test-')
    })
  })

  describe('nested repository detection', () => {
    it('should find git root from nested directory', async () => {
      await runWithTempDir(async tmpDir => {
        // Initialize git repo
        await spawn('git', ['init'], { cwd: tmpDir })

        // Create nested directory
        const nestedDir = path.join(tmpDir, 'nested', 'deep', 'directory')
        await fs.mkdir(nestedDir, { recursive: true })

        const gitRoot = findGitRoot(nestedDir)
        expect(gitRoot).toBe(tmpDir)
      }, 'git-nested-test-')
    })
  })
})
