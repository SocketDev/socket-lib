/**
 * @file Tests for fs/access — sync permission predicates.
 */

import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  canAccess,
  canExecute,
  canRead,
  canWrite,
} from '../../../src/fs/access'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmp: string
let file: string

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'access-test-'))
  file = path.join(tmp, 'f.txt')
  writeFileSync(file, 'hi')
})

afterAll(async () => {
  try {
    await safeDelete(tmp)
  } catch {}
})

describe('canAccess', () => {
  it('true for an existing path (F_OK default)', () => {
    expect(canAccess(file)).toBe(true)
  })

  it('false for a missing path', () => {
    expect(canAccess(path.join(tmp, 'nope'))).toBe(false)
  })
})

describe('canRead', () => {
  it('true for a readable file', () => {
    expect(canRead(file)).toBe(true)
  })

  it('false for a missing file', () => {
    expect(canRead(path.join(tmp, 'nope'))).toBe(false)
  })
})

describe('canWrite', () => {
  it('true for a writable file', () => {
    expect(canWrite(file)).toBe(true)
  })

  it('false for a missing file', () => {
    expect(canWrite(path.join(tmp, 'nope'))).toBe(false)
  })
})

describe('canExecute', () => {
  // chmod x-bit is a no-op on Windows; gate the positive assertion.
  it.skipIf(process.platform === 'win32')('true after chmod +x', () => {
    const exe = path.join(tmp, 'run.sh')
    writeFileSync(exe, '#!/bin/sh\n')
    chmodSync(exe, 0o755)
    expect(canExecute(exe)).toBe(true)
  })

  it('false for a missing file', () => {
    expect(canExecute(path.join(tmp, 'nope'))).toBe(false)
  })
})
