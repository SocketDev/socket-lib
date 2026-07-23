import { chmodSync, mkdirSync, mkdtempSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { ensureIpcDirectory } from '../../../src/ipc/directory'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const IS_WIN = os.platform() === 'win32'

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ipc-dir-test-'))
})

afterEach(async () => {
  await safeDelete(tmpRoot)
})

describe.sequential('ipc/directory — ensureIpcDirectory', () => {
  test('creates the parent directory when it does not exist', async () => {
    const filePath = path.join(tmpRoot, 'nested', 'sub', 'file.sock')
    await ensureIpcDirectory(filePath)
    expect(statSync(path.dirname(filePath)).isDirectory()).toBe(true)
  })

  test('creates a directory with restrictive 0o700 permissions on POSIX', async () => {
    if (IS_WIN) {
      return
    }
    const filePath = path.join(tmpRoot, 'fresh', 'file.sock')
    await ensureIpcDirectory(filePath)
    const mode = statSync(path.dirname(filePath)).mode & 0o777
    expect(mode).toBe(0o700)
  })

  test('tightens an over-permissive existing directory to 0o700', async () => {
    if (IS_WIN) {
      return
    }
    const dir = path.join(tmpRoot, 'loose')
    mkdirSync(dir, { recursive: true })
    chmodSync(dir, 0o755)
    const filePath = path.join(dir, 'file.sock')
    await ensureIpcDirectory(filePath)
    const mode = statSync(dir).mode & 0o777
    expect(mode).toBe(0o700)
  })

  test('leaves an already-0o700 directory untouched (idempotent)', async () => {
    if (IS_WIN) {
      return
    }
    const dir = path.join(tmpRoot, 'tight')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(dir, 0o700)
    const filePath = path.join(dir, 'file.sock')
    await ensureIpcDirectory(filePath)
    const mode = statSync(dir).mode & 0o777
    expect(mode).toBe(0o700)
  })

  test('handles deeply-nested paths recursively', async () => {
    const filePath = path.join(tmpRoot, 'a', 'b', 'c', 'd', 'file.sock')
    await ensureIpcDirectory(filePath)
    expect(statSync(path.dirname(filePath)).isDirectory()).toBe(true)
  })

  test('treats the file at filePath as non-existent — only the parent matters', async () => {
    const filePath = path.join(tmpRoot, 'parent-only', 'never-written.sock')
    await ensureIpcDirectory(filePath)
    expect(statSync(path.dirname(filePath)).isDirectory()).toBe(true)
  })
})
