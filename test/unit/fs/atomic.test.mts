/**
 * @file Unit tests for src/fs/atomic — write-then-rename so a reader never
 *   sees a half-written file, and the scratch file never survives a failure.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { atomicTempPath, writeFileAtomicSync } from '../../../src/fs/atomic.mjs'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

describe('atomicTempPath', () => {
  it('is a dotted sibling in the target directory', () => {
    const temp = atomicTempPath(path.join('/tmp', 'nest', 'hosts.yml'), 4321)
    expect(path.dirname(temp)).toBe(path.join('/tmp', 'nest'))
    expect(path.basename(temp)).toBe('.hosts.yml.4321.tmp')
  })

  it('separates two processes writing the same target', () => {
    const target = path.join('/tmp', 'hosts.yml')
    const first = atomicTempPath(target, 1)
    const second = atomicTempPath(target, 2)
    expect(first).not.toBe(second)
  })
})

describe('writeFileAtomicSync', () => {
  it('writes the payload', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'hosts.yml')

      writeFileAtomicSync(target, 'github.com:\n  user: example-user\n')

      expect(readFileSync(target, 'utf8')).toBe(
        'github.com:\n  user: example-user\n',
      )
    }, 'atomic-write-')
  })

  it('replaces existing bytes', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'hosts.yml')
      writeFileAtomicSync(target, 'before')

      writeFileAtomicSync(target, 'after')

      expect(readFileSync(target, 'utf8')).toBe('after')
    }, 'atomic-replace-')
  })

  it('creates the target directory', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'deep', 'nest', 'hosts.yml')

      writeFileAtomicSync(target, 'made the path')

      expect(readFileSync(target, 'utf8')).toBe('made the path')
    }, 'atomic-mkdir-')
  })

  it('leaves no scratch file behind', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'hosts.yml')

      writeFileAtomicSync(target, 'clean')

      expect(readdirSync(tmpDir)).toEqual(['hosts.yml'])
    }, 'atomic-clean-')
  })

  it('defaults to owner-only permissions', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'hosts.yml')

      writeFileAtomicSync(target, 'private')

      // Windows does not carry POSIX mode bits, so the assertion is meaningless
      // there rather than wrong.
      if (process.platform !== 'win32') {
        expect(statSync(target).mode & 0o777).toBe(0o600)
      }
    }, 'atomic-mode-')
  })

  it('honors an explicit mode', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'build-info.json')

      writeFileAtomicSync(target, '{}', { mode: 0o644 })

      if (process.platform !== 'win32') {
        expect(statSync(target).mode & 0o777).toBe(0o644)
      }
    }, 'atomic-explicit-mode-')
  })

  it('throws and deletes the scratch file when the target is a directory', async () => {
    await runWithTempDir(async tmpDir => {
      // Renaming a file over a non-empty directory fails, which is the cheapest
      // way to reach the failure path without stubbing fs.
      const target = path.join(tmpDir, 'occupied')
      writeFileAtomicSync(path.join(target, 'child.txt'), 'in the way')

      expect(() => writeFileAtomicSync(target, 'nope')).toThrow()
      // The scratch name is spelled out rather than built with atomicTempPath:
      // using the module under test to locate its own leftovers would pass even
      // if both the writer and the namer were wrong the same way.
      const leftover = path.join(tmpDir, `.occupied.${process.pid}.tmp`)
      expect(existsSync(leftover)).toBe(false)
    }, 'atomic-failure-')
  })
})
