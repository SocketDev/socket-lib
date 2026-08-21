/**
 * @file Temporary file and directory utilities for tests.
 */

import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { clearEnv, setEnv } from '../../../src/env/rewire.mjs'
import { safeDelete } from '../../../src/fs/safe.mjs'
import { resetPaths, setPath } from '../../../src/paths/rewire.mjs'

/**
 * Creates a unique temporary directory for testing. The directory is created in
 * the system's temp directory with a unique name.
 */
export async function createTempDir(prefix: string): Promise<string> {
  const tempBaseDir = os.tmpdir()
  const tempDirName = `${prefix}${crypto.randomUUID()}`
  const tempDir = path.join(tempBaseDir, tempDirName)

  await fs.mkdir(tempDir, { recursive: true })
  return tempDir
}

/**
 * Mock the home directory for cross-platform testing. Uses env rewiring for
 * thread-safe test isolation. On Unix: Sets HOME On Windows: Sets USERPROFILE
 * Also sets SOCKET_DLX_DIR for DLX cache isolation.
 */
export function mockHomeDir(homeDir: string): () => void {
  // Use rewiring system for thread-safe env mocking.
  // Also set process.env for subprocess compatibility.
  const originalEnv = {
    HOME: process.env['HOME'],
    SOCKET_DLX_DIR: process.env['SOCKET_DLX_DIR'],
    USERPROFILE: process.env['USERPROFILE'],
  }

  // Set Unix home via rewiring.
  setEnv('HOME', homeDir)
  process.env['HOME'] = homeDir

  // Pin the DLX cache to this test's own dir under os.tmpdir(). `homeDir` comes
  // from createTempDir, so the path is unique per test and never the real
  // ~/.socket/_dlx.
  //
  // Pinned THREE ways on purpose, because getSocketDlxDir() resolves
  // setPath('socket-dlx-dir') → SOCKET_DLX_DIR → $SOCKET_HOME/_dlx →
  // $HOME/.socket/_dlx, and each mechanism covers a different way the others
  // slip:
  //   - setPath is the FIRST override consulted, so it holds even when a
  //     sibling has left a stale SOCKET_DLX_DIR in the environment. That
  //     matters because process.env outlives a file: vitest resets the module
  //     registry between files (isolate: true) but reuses the worker thread,
  //     so an env var set by an earlier file is still there for a later one.
  //   - setEnv is what the in-process env rewiring reads.
  //   - process.env is what SPAWNED binaries inherit, and dlx tests spawn.
  // Falling through to the last rung is the failure this prevents: the cache
  // resolves to the developer's real ~/.socket/_dlx, and an enumeration test
  // counts whatever happens to live there.
  const dlxDir = path.join(homeDir, '.socket', '_dlx')
  setEnv('SOCKET_DLX_DIR', dlxDir)
  process.env['SOCKET_DLX_DIR'] = dlxDir

  // Set Windows home via rewiring.
  if (process.platform === 'win32') {
    setEnv('USERPROFILE', homeDir)
    process.env['USERPROFILE'] = homeDir
  }

  // Reset path cache after env changes.
  resetPaths()

  // AFTER resetPaths, never before: resetPaths() clears every override, so a
  // setPath made earlier in this function would be wiped here and the pin
  // would quietly do nothing while the env var carried the isolation alone.
  setPath('socket-dlx-dir', dlxDir)

  // Return restore function.
  return () => {
    clearEnv('HOME')
    clearEnv('SOCKET_DLX_DIR')
    clearEnv('USERPROFILE')

    if (originalEnv.HOME === undefined) {
      delete process.env['HOME']
    } else {
      process.env['HOME'] = originalEnv.HOME
    }
    if (originalEnv.SOCKET_DLX_DIR === undefined) {
      delete process.env['SOCKET_DLX_DIR']
    } else {
      process.env['SOCKET_DLX_DIR'] = originalEnv.SOCKET_DLX_DIR
    }
    if (originalEnv.USERPROFILE === undefined) {
      delete process.env['USERPROFILE']
    } else {
      process.env['USERPROFILE'] = originalEnv.USERPROFILE
    }

    // Reset path cache after restoring env.
    resetPaths()
  }
}

/**
 * Helper to run a callback with a temporary directory that's automatically
 * cleaned up. Useful for tests that need a temp directory for the duration of a
 * test case.
 */
export async function runWithTempDir(
  callback: (tempDir: string) => Promise<void>,
  prefix = 'tmp',
): Promise<void> {
  const { cleanup, path: tempDir } = await withTempDir(prefix)
  try {
    await callback(tempDir)
  } finally {
    await cleanup()
  }
}

/**
 * Helper to create a temporary directory with automatic cleanup. Returns an
 * object with the temp directory path and cleanup function.
 */
export async function withTempDir(prefix: string): Promise<{
  cleanup: () => Promise<void>
  path: string
}> {
  const tempDir = await createTempDir(prefix)

  const cleanup = async () => {
    try {
      // Force delete temp directory outside CWD.
      await safeDelete(tempDir)
    } catch {
      // Ignore cleanup errors.
    }
  }

  return { cleanup, path: tempDir }
}

/**
 * Helper to create a temporary file with content.
 */
export async function withTempFile(
  content: string,
  options: {
    extension?: string | undefined
    prefix?: string | undefined
  } = {},
): Promise<{
  cleanup: () => Promise<void>
  path: string
}> {
  const { extension = '.txt', prefix = 'temp-file-' } = options

  const tempBaseDir = os.tmpdir()
  const tempFileName = `${prefix}${crypto.randomUUID()}${extension}`
  const tempFile = path.join(tempBaseDir, tempFileName)

  await fs.writeFile(tempFile, content, 'utf8')

  const cleanup = async () => {
    try {
      await safeDelete(tempFile)
    } catch {
      // Ignore cleanup errors.
    }
  }

  return { cleanup, path: tempFile }
}
