/**
 * @file Unit tests for src/git/repo — findOutermostGitRoot. Fixtures are real
 *   temp directories under os.tmpdir() holding real `.git` marker
 *   directories, because the whole point of the walk is what the filesystem
 *   says, not what a mock says.
 */

import { mkdirSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { readRealPath } from '../../../src/fs/inspect.mjs'
import { safeDelete } from '../../../src/fs/safe.mjs'
import { findOutermostGitRoot } from '../../../src/git/repo.mjs'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'socket-git-repo-'))
  tempRoots.push(root)
  // Compare against the realpath: macOS resolves /var to /private/var, and the
  // resolver's containment checks run on realpaths.
  return readRealPath(root) ?? root
}

afterAll(async () => {
  await Promise.all(tempRoots.map(root => safeDelete(root)))
})

describe('findOutermostGitRoot', () => {
  it('returns the input when no ancestor has a git marker', () => {
    const root = makeTempRoot()
    expect(findOutermostGitRoot(root)).toBe(root)
  })

  it('widens past a nested worktree to the outermost git marker', () => {
    const root = makeTempRoot()
    const outer = path.join(root, 'outer')
    const inner = path.join(outer, 'packages', 'inner')
    mkdirSync(path.join(outer, '.git'), { recursive: true })
    mkdirSync(path.join(inner, '.git'), { recursive: true })
    expect(findOutermostGitRoot(inner)).toBe(outer)
  })
})
