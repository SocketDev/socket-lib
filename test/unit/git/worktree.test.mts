/**
 * @file Unit specs for worktree enumeration. Git is the only authority on what
 *   a worktree is, so these cover the porcelain parse and the realpath
 *   normalization that makes a lookup comparable to git's own output.
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it } from 'vitest'

import { normalizePath } from '../../../src/paths/normalize.mts'
import {
  findGitWorktree,
  isRemovableGitWorktree,
  listGitWorktrees,
  listGitWorktreesSync,
  parseGitWorktreePorcelain,
  resolveWorktreePath,
  stdoutText,
} from '../../../src/git/worktree.mts'

const MAIN_AND_LINKED = [
  'worktree /repo',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /repo-feature',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feature/example',
  '',
].join('\n')

describe('parseGitWorktreePorcelain', () => {
  it('returns nothing for empty output', () => {
    assert.deepEqual(parseGitWorktreePorcelain(''), [])
  })

  it('reads the branch without its refs/heads prefix', () => {
    const [main, linked] = parseGitWorktreePorcelain(MAIN_AND_LINKED)
    assert.equal(main!.branch, 'main')
    assert.equal(linked!.branch, 'feature/example')
  })

  // The first stanza git emits is always the main worktree, and removing it is
  // never valid.
  it('marks only the first stanza as main', () => {
    const entries = parseGitWorktreePorcelain(MAIN_AND_LINKED)
    assert.deepEqual(
      entries.map(e => e.main),
      [true, false],
    )
  })

  it('carries HEAD through', () => {
    const [main] = parseGitWorktreePorcelain(MAIN_AND_LINKED)
    assert.equal(main!.head, '1111111111111111111111111111111111111111')
  })

  it('reads a detached HEAD as branchless', () => {
    const [entry] = parseGitWorktreePorcelain(
      [
        'worktree /repo-detached',
        'HEAD 3333333333333333333333333333333333333333',
        'detached',
        '',
      ].join('\n'),
    )
    assert.equal(entry!.detached, true)
    assert.equal(entry!.branch, undefined)
  })

  it('reads a bare worktree', () => {
    const [entry] = parseGitWorktreePorcelain(
      ['worktree /repo-bare', 'bare', ''].join('\n'),
    )
    assert.equal(entry!.bare, true)
    assert.equal(entry!.head, undefined)
  })

  // A locked worktree is off-limits to automated removal whether or not git
  // recorded a reason, so the flag and the reason are separate fields.
  it('reads a reasonless lock as locked', () => {
    const [entry] = parseGitWorktreePorcelain(
      ['worktree /repo-locked', 'locked', ''].join('\n'),
    )
    assert.equal(entry!.locked, true)
    assert.equal(entry!.lockReason, undefined)
  })

  it('keeps the lock reason when git recorded one', () => {
    const [entry] = parseGitWorktreePorcelain(
      ['worktree /repo-locked', 'locked on removable media', ''].join('\n'),
    )
    assert.equal(entry!.locked, true)
    assert.equal(entry!.lockReason, 'on removable media')
  })

  it('reads prunable with and without a reason', () => {
    const [bare] = parseGitWorktreePorcelain(
      ['worktree /gone', 'prunable', ''].join('\n'),
    )
    assert.equal(bare!.prunable, true)
    assert.equal(bare!.prunableReason, undefined)
    const [withReason] = parseGitWorktreePorcelain(
      [
        'worktree /gone',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n'),
    )
    assert.equal(
      withReason!.prunableReason,
      'gitdir file points to non-existent location',
    )
  })

  it('tolerates output with no trailing blank line', () => {
    const entries = parseGitWorktreePorcelain(
      ['worktree /repo', 'branch refs/heads/main'].join('\n'),
    )
    assert.equal(entries.length, 1)
    assert.equal(entries[0]!.branch, 'main')
  })

  it('tolerates CRLF', () => {
    const entries = parseGitWorktreePorcelain(
      'worktree /repo\r\nbranch refs/heads/main\r\n\r\n',
    )
    assert.equal(entries.length, 1)
  })

  it('skips a stanza carrying no worktree line', () => {
    assert.deepEqual(
      parseGitWorktreePorcelain('HEAD abc\nbranch refs/heads/main\n\n'),
      [],
    )
  })
})

describe('resolveWorktreePath', () => {
  // Git reports a worktree by its RESOLVED path. On macOS os.tmpdir() is
  // /var/folders/..., a symlink to /private/var/folders/..., so naive string
  // equality misses every worktree created under the system temp dir.
  it('resolves a symlinked temp dir the way git reports it', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'lib-worktree-'))
    assert.equal(resolveWorktreePath(dir), normalizePath(realpathSync(dir)))
  })

  it('falls back to the normalized path when the directory is gone', () => {
    const gone = path.join(os.tmpdir(), 'lib-worktree-does-not-exist-12345')
    assert.equal(resolveWorktreePath(gone), normalizePath(gone))
  })

  it('resolves a relative path against the cwd', () => {
    assert.equal(
      resolveWorktreePath('.'),
      normalizePath(realpathSync(path.resolve('.'))),
    )
  })
})

describe('stdoutText', () => {
  it('passes a string through', () => {
    assert.equal(stdoutText('worktree /repo'), 'worktree /repo')
  })

  it('decodes a Buffer', () => {
    assert.equal(stdoutText(Buffer.from('worktree /repo')), 'worktree /repo')
  })

  it('reads undefined as empty', () => {
    assert.equal(stdoutText(undefined), '')
  })
})

describe('listGitWorktrees', () => {
  it('lists the main worktree of this repository', async () => {
    const entries = await listGitWorktrees(process.cwd())
    assert.ok(entries.length > 0)
    assert.equal(entries[0]!.main, true)
  })

  // Fails soft: a non-repo yields an empty list rather than throwing, so a
  // sweeper never breaks a session over a git hiccup.
  it('returns empty outside a repository', async () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'lib-worktree-outside-'))
    assert.deepEqual(await listGitWorktrees(outside), [])
  })

  it('agrees with the sync form', async () => {
    const asyncPaths = (await listGitWorktrees(process.cwd())).map(e => e.path)
    const syncPaths = listGitWorktreesSync(process.cwd()).map(e => e.path)
    assert.deepEqual(syncPaths, asyncPaths)
  })
})

describe('findGitWorktree', () => {
  it('finds the main worktree by any path spelling', async () => {
    const found = await findGitWorktree(process.cwd(), process.cwd())
    assert.ok(found)
    assert.equal(found.main, true)
  })

  // The check to make before removing anything: a directory git does not list
  // is not a worktree, whatever its name or location suggests.
  it('returns undefined for a directory git does not list', async () => {
    const stranger = mkdtempSync(
      path.join(os.tmpdir(), 'lib-worktree-stranger-'),
    )
    mkdirSync(path.join(stranger, 'looks-like-a-worktree'), { recursive: true })
    assert.equal(
      await findGitWorktree(
        process.cwd(),
        path.join(stranger, 'looks-like-a-worktree'),
      ),
      undefined,
    )
  })
})

describe('isRemovableGitWorktree', () => {
  it('refuses the main worktree', async () => {
    assert.equal(
      await isRemovableGitWorktree(process.cwd(), process.cwd()),
      false,
    )
  })

  it('refuses a directory git does not list', async () => {
    const stranger = mkdtempSync(
      path.join(os.tmpdir(), 'lib-worktree-stranger-'),
    )
    assert.equal(await isRemovableGitWorktree(process.cwd(), stranger), false)
  })
})
