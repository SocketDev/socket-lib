/**
 * @file Unit specs for worktree enumeration. Git is the only authority on what
 *   a worktree is, so these cover the porcelain parse and the realpath
 *   normalization that makes a lookup comparable to git's own output.
 */

import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, it } from 'vitest'

import { normalizePath } from '../../../src/paths/normalize.mts'
import { spawnSync } from '../../../src/process/spawn/child.mts'
import {
  createGitWorktreeTmpDir,
  findGitWorktree,
  getGitWorktreeTmpDir,
  GIT_WORKTREE_LIST_ARGS,
  isRemovableGitWorktree,
  listGitWorktrees,
  listGitWorktreesSync,
  parseGitWorktreePorcelain,
  resolveWorktreePath,
  sanitizeWorktreeLabel,
  splitPorcelainLines,
  stdoutText,
} from '../../../src/git/worktree.mts'

const NS = 'socket-lib-worktree-spec'

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
    const { 0: main, 1: linked } = parseGitWorktreePorcelain(MAIN_AND_LINKED)
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
    const { 0: main } = parseGitWorktreePorcelain(MAIN_AND_LINKED)
    assert.equal(main!.head, '1111111111111111111111111111111111111111')
  })

  it('reads a detached HEAD as branchless', () => {
    const { 0: entry } = parseGitWorktreePorcelain(
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
    const { 0: entry } = parseGitWorktreePorcelain(
      ['worktree /repo-bare', 'bare', ''].join('\n'),
    )
    assert.equal(entry!.bare, true)
    assert.equal(entry!.head, undefined)
  })

  // A locked worktree is off-limits to automated removal whether or not git
  // recorded a reason, so the flag and the reason are separate fields.
  it('reads a reasonless lock as locked', () => {
    const { 0: entry } = parseGitWorktreePorcelain(
      ['worktree /repo-locked', 'locked', ''].join('\n'),
    )
    assert.equal(entry!.locked, true)
    assert.equal(entry!.lockReason, undefined)
  })

  it('keeps the lock reason when git recorded one', () => {
    const { 0: entry } = parseGitWorktreePorcelain(
      ['worktree /repo-locked', 'locked on removable media', ''].join('\n'),
    )
    assert.equal(entry!.locked, true)
    assert.equal(entry!.lockReason, 'on removable media')
  })

  it('reads prunable with and without a reason', () => {
    const { 0: bare } = parseGitWorktreePorcelain(
      ['worktree /gone', 'prunable', ''].join('\n'),
    )
    assert.equal(bare!.prunable, true)
    assert.equal(bare!.prunableReason, undefined)
    const { 0: withReason } = parseGitWorktreePorcelain(
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

  it('parses the -z form git is asked for', () => {
    const entries = parseGitWorktreePorcelain(
      'worktree /repo\0branch refs/heads/main\0\0worktree /repo-wt\0detached\0\0',
    )
    assert.equal(entries.length, 2)
    assert.equal(entries[0]!.branch, 'main')
    assert.equal(entries[1]!.detached, true)
  })

  // The reason -z is not optional: a worktree path holding a newline cannot be
  // read out of the line-oriented form, and a path is what gets deleted.
  it('keeps a newline inside a path intact under -z', () => {
    const { 0: entry } = parseGitWorktreePorcelain(
      'worktree /odd\nname\0detached\0\0',
    )
    assert.equal(entry!.path, resolveWorktreePath('/odd\nname'))
  })

  // Without -z, git escapes unusual characters in a lock reason and quotes the
  // whole value per core.quotePath. Under -z the reason arrives raw.
  it('reads a raw multi-line lock reason under -z', () => {
    const { 0: entry } = parseGitWorktreePorcelain(
      'worktree /locked\0locked reason\nwith a newline\0\0',
    )
    assert.equal(entry!.lockReason, 'reason\nwith a newline')
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

describe('GIT_WORKTREE_LIST_ARGS', () => {
  // git's own manual: "It is recommended to combine this with -z". Dropping it
  // reintroduces the newline-in-path and quoted-lock-reason failures below.
  it('asks git for the -z porcelain form', () => {
    assert.deepEqual(
      [...GIT_WORKTREE_LIST_ARGS],
      ['worktree', 'list', '--porcelain', '-z'],
    )
  })
})

describe('splitPorcelainLines', () => {
  it('splits the -z form on NUL', () => {
    assert.deepEqual(splitPorcelainLines('worktree /repo\0bare\0\0'), [
      'worktree /repo',
      'bare',
      '',
      '',
    ])
  })

  it('splits the plain form on newlines', () => {
    assert.deepEqual(splitPorcelainLines('worktree /repo\nbare\n'), [
      'worktree /repo',
      'bare',
      '',
    ])
  })

  it('tolerates CRLF in the plain form', () => {
    assert.deepEqual(splitPorcelainLines('worktree /repo\r\nbare'), [
      'worktree /repo',
      'bare',
    ])
  })

  // A NUL anywhere means the payload is the -z form, so splitting on newlines
  // too would corrupt exactly the record -z exists to protect.
  it('never splits a NUL payload on an embedded newline', () => {
    assert.deepEqual(splitPorcelainLines('worktree /has\nnewline\0bare\0'), [
      'worktree /has\nnewline',
      'bare',
      '',
    ])
  })
})

describe('sanitizeWorktreeLabel', () => {
  it('passes a safe label through', () => {
    assert.equal(sanitizeWorktreeLabel('review-pr_42.v1'), 'review-pr_42.v1')
  })

  // A separator or a `..` segment must not steer the path out of its parent.
  it('collapses separators and trims the residue', () => {
    assert.equal(sanitizeWorktreeLabel('../../escape'), 'escape')
    assert.equal(sanitizeWorktreeLabel('a/b/c'), 'a-b-c')
  })

  it('falls back for a label of pure separators', () => {
    assert.equal(sanitizeWorktreeLabel('///'), 'task')
    assert.equal(sanitizeWorktreeLabel(''), 'task')
  })

  it('caps the length', () => {
    assert.equal(sanitizeWorktreeLabel('x'.repeat(200)).length, 40)
  })
})

describe('getGitWorktreeTmpDir', () => {
  it('creates the home under the system temp dir', () => {
    const home = getGitWorktreeTmpDir(NS)
    assert.equal(path.basename(home), NS)
    assert.ok(existsSync(home))
  })

  // The dir has to exist before the resolve, or macOS hands back the
  // unresolved /var/folders spelling that never matches git's output.
  it('returns the resolved form git would report', () => {
    assert.equal(
      getGitWorktreeTmpDir(NS),
      normalizePath(realpathSync(path.join(os.tmpdir(), NS))),
    )
  })

  it('sanitizes a namespace that would escape the temp dir', () => {
    const home = getGitWorktreeTmpDir('../../escape-ns')
    assert.equal(path.dirname(home), normalizePath(realpathSync(os.tmpdir())))
  })
})

describe('createGitWorktreeTmpDir', () => {
  it('lands inside the namespace home and carries the label', () => {
    const dir = createGitWorktreeTmpDir(NS, 'review-pr-42')
    assert.equal(path.dirname(dir), getGitWorktreeTmpDir(NS))
    assert.ok(path.basename(dir).startsWith('review-pr-42-'))
  })

  // mkdtemp, not a pid or a timestamp, so concurrent callers cannot collide.
  it('two calls with one label produce two directories', () => {
    assert.notEqual(
      createGitWorktreeTmpDir(NS, 'same'),
      createGitWorktreeTmpDir(NS, 'same'),
    )
  })

  it('is a real directory git can be pointed at', () => {
    assert.ok(existsSync(createGitWorktreeTmpDir(NS, 'real')))
  })
})

function git(cwd: string, ...args: string[]): void {
  spawnSync('git', args, { cwd })
}

function makeRepo(): string {
  const repo = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'lib-wt-repo-')))
  git(repo, 'init', '--quiet', '--initial-branch', 'main')
  git(repo, 'config', 'user.email', 'octocat@example.com')
  git(repo, 'config', 'user.name', 'octocat')
  git(repo, 'config', 'commit.gpgsign', 'false')
  writeFileSync(path.join(repo, 'example.txt'), 'seed\n')
  git(repo, 'add', 'example.txt')
  git(repo, 'commit', '--quiet', '--no-gpg-sign', '-m', 'chore: seed')
  return repo
}

describe('listGitWorktrees against real git', () => {
  it('sees a worktree created under the OS temp dir', async () => {
    const repo = makeRepo()
    const wt = createGitWorktreeTmpDir(NS, 'listed')
    git(repo, 'worktree', 'add', '--detach', wt, 'HEAD')
    const paths = (await listGitWorktrees(repo)).map(e => e.path)
    assert.ok(paths.includes(resolveWorktreePath(wt)))
  })

  // Proves -z reached git: the plain form would return this quoted, with the
  // newline spelled out as an escape.
  it('returns a multi-line lock reason unquoted and unescaped', async () => {
    const repo = makeRepo()
    const wt = createGitWorktreeTmpDir(NS, 'locked')
    git(repo, 'worktree', 'add', '--detach', wt, 'HEAD')
    git(repo, 'worktree', 'lock', wt, '--reason', 'reason\nwith a newline')
    const found = await findGitWorktree(repo, wt)
    assert.equal(found?.locked, true)
    assert.equal(found?.lockReason, 'reason\nwith a newline')
    assert.equal(await isRemovableGitWorktree(repo, wt), false)
    git(repo, 'worktree', 'unlock', wt)
  })

  it('reports the main worktree first and a linked one after', async () => {
    const repo = makeRepo()
    const wt = createGitWorktreeTmpDir(NS, 'ordered')
    git(repo, 'worktree', 'add', '--detach', wt, 'HEAD')
    const entries = await listGitWorktrees(repo)
    assert.equal(entries[0]!.main, true)
    assert.equal(entries[0]!.path, resolveWorktreePath(repo))
    assert.equal(entries.filter(e => !e.main).length, 1)
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

// Asserted directly rather than only against the async form: two identically
// broken implementations would agree with each other and pass.
describe('listGitWorktreesSync', () => {
  it('lists the main worktree of a fresh repo', () => {
    const repo = makeRepo()
    const entries = listGitWorktreesSync(repo)
    assert.equal(entries.length, 1)
    assert.equal(entries[0]!.main, true)
    assert.equal(entries[0]!.path, resolveWorktreePath(repo))
  })

  it('sees a linked worktree under the OS temp dir', () => {
    const repo = makeRepo()
    const wt = createGitWorktreeTmpDir(NS, 'sync-listed')
    git(repo, 'worktree', 'add', '--detach', wt, 'HEAD')
    const paths = listGitWorktreesSync(repo).map(e => e.path)
    assert.ok(paths.includes(resolveWorktreePath(wt)))
  })

  // Fails soft: an empty list means "remove nothing", the safe direction.
  it('returns empty outside a repository', () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'lib-wt-sync-outside-'))
    assert.deepEqual(listGitWorktreesSync(outside), [])
  })

  it('reads a raw multi-line lock reason, proving -z on the sync path', () => {
    const repo = makeRepo()
    const wt = createGitWorktreeTmpDir(NS, 'sync-locked')
    git(repo, 'worktree', 'add', '--detach', wt, 'HEAD')
    git(repo, 'worktree', 'lock', wt, '--reason', 'reason\nwith a newline')
    const found = listGitWorktreesSync(repo).find(
      e => e.path === resolveWorktreePath(wt),
    )
    assert.equal(found?.lockReason, 'reason\nwith a newline')
    git(repo, 'worktree', 'unlock', wt)
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
