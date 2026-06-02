import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

import { afterEach, beforeEach, vi } from 'vitest'

import type { Mock } from 'vitest'
import type * as SpawnChild from '@socketsecurity/lib-stable/process/spawn/child'

export interface FakeChild extends EventEmitter {
  stdin: Writable
  stdout: Readable
  stderr: Readable
}

/**
 * Build the mocked `@socketsecurity/lib-stable/process/spawn/child` module for
 * a `vi.mock` factory. src/secrets/windows.ts imports `spawn`/`spawnSync` from
 * that module (NOT node:child_process), so this is the correct mock target —
 * mocking node:child_process is a no-op and lets the real powershell binary
 * run. The mocks sit on both the named and default exports. Usage:
 *
 * Vi.mock(import('@socketsecurity/lib-stable/process/spawn/child'), () =>
 * spawnChildMockFactory(mockSpawn, mockSpawnSync))
 */
export async function spawnChildMockFactory(
  mockSpawn: Mock,
  mockSpawnSync: Mock,
): Promise<typeof SpawnChild> {
  const actual = await vi.importActual<typeof SpawnChild>(
    '@socketsecurity/lib-stable/process/spawn/child',
  )
  const mocked = {
    ...actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  } as unknown as typeof SpawnChild
  return { ...mocked, default: mocked } as unknown as typeof SpawnChild
}

// `@socketsecurity/lib-stable/process/spawn/child`'s `spawn()` returns
// `{ process: ChildProcess, ... }` (the lib wraps the raw child), and
// src/secrets/windows.ts destructures `const { process: cp } = spawn(...)`.
// Return that wrapped shape so `mockSpawn.mockImplementationOnce(() =>
// makeFakeChild({ ... }))` matches the real contract.
export function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
}): { process: FakeChild } {
  const emitter = new EventEmitter() as FakeChild
  emitter.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  emitter.stdout = Readable.from(opts.stdout ? [opts.stdout] : [])
  emitter.stderr = Readable.from(opts.stderr ? [opts.stderr] : [])
  const stdoutDone = !opts.stdout
    ? Promise.resolve()
    : new Promise<void>(r => emitter.stdout.on('end', () => r()))
  const stderrDone = !opts.stderr
    ? Promise.resolve()
    : new Promise<void>(r => emitter.stderr.on('end', () => r()))
  Promise.all([stdoutDone, stderrDone]).then(() => {
    if (opts.emitError) {
      emitter.emit('error', opts.emitError)
    }
    emitter.emit('close', opts.exitCode ?? 0)
  })
  return { process: emitter }
}

export const harness = {
  tmpRoot: '',
}

export async function loadFresh() {
  const mod = await import('../../../src/secrets/windows')
  return mod
}

export function setupHarness(mocks: {
  mockSpawn: Mock
  mockSpawnSync: Mock
}): void {
  let origAppData: string | undefined
  beforeEach(() => {
    harness.tmpRoot = mkdtempSync(
      path.join(os.tmpdir(), 'secrets-windows-test-'),
    )
    origAppData = process.env['APPDATA']
    process.env['APPDATA'] = harness.tmpRoot
    vi.resetModules()
    mocks.mockSpawn.mockReset()
    mocks.mockSpawnSync.mockReset()
  })
  afterEach(() => {
    rmSync(harness.tmpRoot, { force: true, recursive: true })
    if (origAppData === undefined) {
      delete process.env['APPDATA']
    } else {
      process.env['APPDATA'] = origAppData
    }
    vi.clearAllMocks()
  })
}
