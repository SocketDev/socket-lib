/**
 * @file Unit tests for src/git/exec — gitSpawn, gitSync, detectLockError, and
 *   stderrText. Fixtures are real temp git repositories under os.tmpdir(),
 *   because the defects here (a non-zero exit rejecting instead of
 *   resolving, a nullish stderr crashing the lock scan) only reproduce
 *   against a real spawned git process, not a mock.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  detectLockError,
  GitLockError,
  gitSpawn,
  gitSync,
  stderrText,
} from '../../../src/git/exec.mjs'
import { spawnSync } from '../../../src/process/spawn/child.mjs'
import { runWithTempDir } from '../util/temp-file-helper.mjs'

// Real git spawns under CPU contention; match the sibling
// extended-real-ops.test.mts describe-scope timeout bump.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

function initRepo(cwd: string): void {
  spawnSync('git', ['init'], { cwd })
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd })
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd })
}

describe('gitSpawn', () => {
  it('resolves (does not reject) on a non-zero exit', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      // Verifying a ref that doesn't exist is an ordinary non-zero exit, not
      // a launch failure — the module's contract (see @file header) says
      // this resolves so the caller can branch on .code.
      const result = await gitSpawn(
        ['rev-parse', '--verify', 'refs/heads/does-not-exist'],
        { cwd: tmpDir },
      )
      expect(result.code).not.toBe(0)
      expect(typeof result.stderr).toBe('string')
    }, 'git-exec-nonzero-')
  })

  it('throws GitLockError on a real index.lock contention', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      // Simulate another git process holding the index: a real
      // .git/index.lock file makes git itself refuse to write the index,
      // the same signature a genuine concurrent git op produces.
      writeFileSync(path.join(tmpDir, '.git', 'index.lock'), '')
      await expect(
        gitSpawn(['add', '-A'], { cwd: tmpDir }),
      ).rejects.toMatchObject({ name: 'GitLockError' })
    }, 'git-exec-lock-')
  })
})

describe('gitSync', () => {
  it('returns (does not throw) on a non-zero exit', async () => {
    await runWithTempDir(async tmpDir => {
      initRepo(tmpDir)
      const result = gitSync(
        ['rev-parse', '--verify', 'refs/heads/does-not-exist'],
        { cwd: tmpDir },
      )
      expect(result.status).not.toBe(0)
    }, 'git-exec-sync-nonzero-')
  })
})

describe('detectLockError', () => {
  it('does not throw when stderr is undefined', () => {
    expect(() => detectLockError('git', ['status'], undefined)).not.toThrow()
  })

  it('throws GitLockError when stderr contains index.lock', () => {
    expect(() =>
      detectLockError(
        'git',
        ['add', '-A'],
        "Unable to create '.git/index.lock': File exists.",
      ),
    ).toThrow(GitLockError)
  })
})

describe('stderrText', () => {
  it('returns an empty string for undefined', () => {
    expect(stderrText(undefined)).toBe('')
  })

  it('passes through a string unchanged', () => {
    expect(stderrText('boom')).toBe('boom')
  })

  it('decodes a Buffer as utf8', () => {
    expect(stderrText(Buffer.from('boom', 'utf8'))).toBe('boom')
  })
})
