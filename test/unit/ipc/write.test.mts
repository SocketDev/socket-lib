import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { getIpcStubPath } from '../../../src/ipc/paths'
import { writeIpcStub } from '../../../src/ipc/write'

const IS_WIN = os.platform() === 'win32'

let appName: string
let stubPath: string
let appDir: string

beforeEach(() => {
  appName = `socket-lib-test-${process.pid}-${Date.now()}-${Math.floor(
    Math.random() * 1_000_000,
  )}`
  stubPath = getIpcStubPath(appName)
  appDir = path.dirname(stubPath)
})

afterEach(() => {
  rmSync(appDir, { force: true, recursive: true })
})

describe.sequential('ipc/write — writeIpcStub', () => {
  test('returns the stub path and creates the file', async () => {
    const returned = await writeIpcStub(appName, { hello: 'world' })
    expect(returned).toBe(stubPath)
    expect(existsSync(stubPath)).toBe(true)
  })

  test('serializes data with pid + timestamp wrapper', async () => {
    const before = Date.now()
    await writeIpcStub(appName, { token: 'abc' })
    const after = Date.now()
    const parsed = JSON.parse(readFileSync(stubPath, 'utf8'))
    expect(parsed.pid).toBe(process.pid)
    expect(parsed.data).toEqual({ token: 'abc' })
    expect(typeof parsed.timestamp).toBe('number')
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before)
    expect(parsed.timestamp).toBeLessThanOrEqual(after)
  })

  test('writes the file with 0o600 permissions on POSIX', async () => {
    if (IS_WIN) {
      return
    }
    await writeIpcStub(appName, { v: 1 })
    expect(statSync(stubPath).mode & 0o777).toBe(0o600)
  })

  test('replaces a stale stub (EEXIST → safeDelete → re-create)', async () => {
    await writeIpcStub(appName, { v: 1 })
    expect(JSON.parse(readFileSync(stubPath, 'utf8')).data).toEqual({ v: 1 })
    // Second call overwrites the first via the EEXIST retry branch.
    await writeIpcStub(appName, { v: 2 })
    expect(JSON.parse(readFileSync(stubPath, 'utf8')).data).toEqual({ v: 2 })
  })

  test('round-trips nested data structures', async () => {
    const data = {
      array: [1, 2, 3],
      nested: { a: { b: { c: 'deep' } } },
      bool: true,
      str: 'hello',
    }
    await writeIpcStub(appName, data)
    expect(JSON.parse(readFileSync(stubPath, 'utf8')).data).toEqual(data)
  })

  test('creates the .socket-ipc/<appName> directory if absent', async () => {
    expect(existsSync(appDir)).toBe(false)
    await writeIpcStub(appName, { v: 1 })
    expect(existsSync(appDir)).toBe(true)
    expect(statSync(appDir).isDirectory()).toBe(true)
  })
})
