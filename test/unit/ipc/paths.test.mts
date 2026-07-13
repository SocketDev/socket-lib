import os from 'node:os'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { getIpcStubPath } from '../../../src/ipc/paths'

describe('ipc/paths — getIpcStubPath', () => {
  it('should return path in temp directory', () => {
    const stubPath = getIpcStubPath('socket-cli')
    const tempDir = os.tmpdir()
    expect(stubPath).toContain(tempDir)
    expect(stubPath).toContain('.socket-ipc')
    expect(stubPath).toContain('socket-cli')
  })

  it('should include process ID in filename', () => {
    const stubPath = getIpcStubPath('test-app')
    expect(stubPath).toContain(`stub-${process.pid}.json`)
  })

  it('should create unique paths for different apps', () => {
    const path1 = getIpcStubPath('app1')
    const path2 = getIpcStubPath('app2')
    expect(path1).not.toBe(path2)
  })
})
