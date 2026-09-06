/**
 * @file One scratch-directory fixture, with a delete that refuses any target
 *   outside the OS temp dir.
 *   A suite that redirects a path constant into a throwaway tree, then deletes
 *   that tree in its teardown, is one failed redirect away from deleting the
 *   real one. The redirect usually lives in a HOISTED mock factory, and a
 *   factory that throws — `mkdtempSync` under fork pressure, for one — leaves
 *   the constant pointing at the live checkout. The teardown then runs against
 *   a real path with full recursion.
 *   `path.isAbsolute` does NOT catch that: a live checkout is absolute too.
 *   Containment in `os.tmpdir()` is the invariant that does.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodeOs } from '../node/os.mjs'
import { getNodePath } from '../node/path.mjs'
import { normalizePath } from '../paths/normalize.mjs'
import { safeDelete } from './safe.mjs'

/**
 * A throwaway directory and the operations a fixture needs on it.
 */
export interface ScratchDir {
  /**
   * Remove the tree. Safe to call twice; the second call is a no-op.
   */
  cleanup(): Promise<void>
  /**
   * The absolute directory path.
   */
  dir: string
  /**
   * An absolute path inside the tree.
   */
  join(...segments: string[]): string
  /**
   * Write a file inside the tree, creating parent directories, and answer its
   * absolute path.
   */
  write(relativePath: string, contents: string): string
}

/**
 * Delete a scratch tree, or throw when it is not one.
 *
 * Throwing beats a silent skip: a suite whose redirect failed has already been
 * asserting against the live tree, and a loud cleanup failure is the only
 * signal that says so.
 */
export async function deleteScratchTree(target: string): Promise<void> {
  if (!isScratchPath(target)) {
    const os = getNodeOs()
    throw new Error(
      `Refusing to delete a non-scratch path.\n` +
        `Where: a teardown that expected an os.tmpdir() tree.\n` +
        `Saw: ${JSON.stringify(target)}; wanted a path under ${JSON.stringify(os.tmpdir())}.\n` +
        `Fix: the path redirect did not apply - check the hoisted mock factory did not throw.`,
    )
  }
  await safeDelete(target)
}

/**
 * Whether a path sits inside the OS temp dir, and is not the temp dir itself.
 *
 * Compared by path SEGMENT, so a sibling whose name merely starts with the
 * temp dir's name does not read as contained.
 */
export function isScratchPath(target: string): boolean {
  const path = getNodePath()
  if (!target || !path.isAbsolute(target)) {
    return false
  }
  const os = getNodeOs()
  const tmpRoot = normalizePath(path.resolve(os.tmpdir()))
  const resolved = normalizePath(path.resolve(target))
  return resolved !== tmpRoot && resolved.startsWith(`${tmpRoot}/`)
}

/**
 * Create a throwaway directory under the OS temp dir.
 *
 * `prefix` names the suite so a leaked tree is traceable to its owner. The
 * returned `cleanup` is guarded, so it cannot recurse over the live checkout
 * even when a caller hands it a path the fixture did not create.
 */
export function makeScratchDir(prefix: string): ScratchDir {
  const fs = getNodeFs()
  const os = getNodeOs()
  const path = getNodePath()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`))
  let removed = false
  return {
    async cleanup(): Promise<void> {
      if (removed) {
        return
      }
      removed = true
      await deleteScratchTree(dir)
    },
    dir,
    join(...segments: string[]): string {
      return path.join(dir, ...segments)
    },
    write(relativePath: string, contents: string): string {
      const target = path.join(dir, relativePath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, contents, 'utf8')
      return target
    },
  }
}
