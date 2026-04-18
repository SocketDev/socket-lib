/**
 * @fileoverview Unit tests for Inter-Process Communication utilities.
 *
 * Tests:
 * - getIpcStubPath() resolves IPC stub file paths
 * - writeIpcStub() writes restricted-perm stub files
 * Used by Socket CLI for parent-child process communication.
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import { getIpcStubPath, writeIpcStub } from '../../src/ipc'
import { resetPaths, setPath } from '../../src/paths/rewire'

import { runWithTempDir } from './utils/temp-file-helper'

describe('ipc', () => {
  describe('getIpcStubPath', () => {
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

  describe('writeIpcStub', () => {
    it('should write stub file with valid data', async () => {
      await runWithTempDir(async tmpDir => {
        setPath('tmpdir', tmpDir)
        try {
          const data = { apiToken: 'test-token', config: { foo: 'bar' } }
          const stubPath = await writeIpcStub('test-app', data)

          expect(stubPath).toContain(tmpDir)

          const content = await fs.readFile(stubPath, 'utf8')
          const parsed = JSON.parse(content)

          expect(parsed.pid).toBe(process.pid)
          expect(parsed.timestamp).toBeTypeOf('number')
          expect(parsed.data).toEqual(data)
        } finally {
          resetPaths()
        }
      }, 'ipc-write-test-')
    })

    it('should create directory structure if not exists', async () => {
      await runWithTempDir(async tmpDir => {
        setPath('tmpdir', tmpDir)
        try {
          const stubPath = await writeIpcStub('new-app', { test: 'data' })
          const dirExists = await fs
            .stat(path.dirname(stubPath))
            .then(() => true)
            .catch(() => false)
          expect(dirExists).toBe(true)
        } finally {
          resetPaths()
        }
      }, 'ipc-mkdir-test-')
    })

    it('should write with 0o600 restrictive permissions', async () => {
      // Skip on Windows where POSIX permissions don't apply.
      if (process.platform === 'win32') {
        return
      }
      await runWithTempDir(async tmpDir => {
        setPath('tmpdir', tmpDir)
        try {
          const stubPath = await writeIpcStub('perm-test', { x: 1 })
          const stat = await fs.stat(stubPath)
          // File mode — lower 9 bits are permission bits. Expect 0o600.
          // eslint-disable-next-line no-bitwise
          expect(stat.mode & 0o777).toBe(0o600)
        } finally {
          resetPaths()
        }
      }, 'ipc-perm-test-')
    })
  })
})
