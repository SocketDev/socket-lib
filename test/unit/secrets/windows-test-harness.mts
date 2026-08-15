import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

import { afterEach, beforeEach, vi } from 'vitest'

import type { Mock } from 'vitest'
import type * as SpawnChild from '../../../src/process/spawn/child.mjs'
import { safeDelete } from '../../../src/fs/safe.mjs'

export interface FakeChild extends EventEmitter {
  stdin: Writable
  stdout: Readable
  stderr: Readable
}

/**
 * Build the mocked `../../../src/process/spawn/child` module for
 * a `vi.mock` factory. src/secrets/windows.ts imports `spawn`/`spawnSync` from
 * that module (NOT node:child_process), so this is the correct mock target —
 * mocking node:child_process is a no-op and lets the real powershell binary
 * run. The mocks sit on both the named and default exports. Usage:
 *
 * Vi.mock(import('../../../src/process/spawn/child.mjs'), () =>
 * spawnChildMockFactory(mockSpawn, mockSpawnSync))
 */
export async function spawnChildMockFactory(
  mockSpawn: Mock,
  mockSpawnSync: Mock,
): Promise<typeof SpawnChild> {
  const actual = await vi.importActual<typeof SpawnChild>(
    '../../../src/process/spawn/child',
  )
  const mocked = {
    ...actual,
    spawn: mockSpawn,
    spawnSync: mockSpawnSync,
  } as unknown as typeof SpawnChild
  return { ...mocked, default: mocked } as unknown as typeof SpawnChild
}

// `../../../src/process/spawn/child`'s `spawn()` returns
// `{ process: ChildProcess, ... }` because the lib wraps the raw child, and
// src/secrets/windows.ts destructures `const { process: cp } = spawn(...)`.
// Return that wrapped shape so `mockSpawn.mockImplementationOnce(() =>
// makeFakeChild({ ... }))` matches the real contract.
// The lib's `spawn()` returns `{ process: ChildProcess } & Promise<{ code,
// stdout, stderr }>` — awaitable AND carrying the raw child on `.process`. The
// runners now `await` the spawn result (stdioString → string stdout/stderr) and
// read stdin via `.process.stdin`; a non-zero exit REJECTS, carrying the result
// on the error. Emit the raw child's events too, for any event-style consumer.
export function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
}): { process: FakeChild } & Promise<{
  code: number | null
  stdout: string
  stderr: string
}> {
  const emitter = new EventEmitter() as FakeChild
  emitter.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })
  emitter.stdout = Readable.from(opts.stdout ? [opts.stdout] : [])
  emitter.stderr = Readable.from(opts.stderr ? [opts.stderr] : [])
  const stdout = opts.stdout ?? ''
  const stderr = opts.stderr ?? ''
  const code = opts.exitCode ?? 0
  const settled = new Promise<{
    code: number | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    queueMicrotask(() => {
      if (opts.emitError) {
        // Only emit the EventEmitter `error` if something listens — an
        // `error` event with no listener throws as an uncaught exception
        // under Node semantics. The await-style runners DON'T listen on
        // `.process.on('error')`; the event-style ones (deleteX) do.
        if (emitter.listenerCount('error') > 0) {
          emitter.emit('error', opts.emitError)
        }
        // A spawn error (e.g. ENOENT) carries a non-numeric `.code` (e.g.
        // "ENOENT") on the lib's rejection — the runner's catch maps a
        // non-numeric code to status -1.
        reject(Object.assign(opts.emitError, { stderr, stdout }))
        return
      }
      emitter.emit('close', code)
      if (code !== 0) {
        reject(
          Object.assign(new Error(`exit ${code}`), { code, stderr, stdout }),
        )
        return
      }
      resolve({ code, stderr, stdout })
    })
  })
  settled.catch(() => {})
  return Object.assign(settled, { process: emitter }) as {
    process: FakeChild
  } & Promise<{ code: number | null; stdout: string; stderr: string }>
}

export const harness = {
  tmpRoot: '',
}

export async function loadFresh() {
  const mod = await import('../../../src/secrets/windows.mjs')
  return mod
}

export function setupHarness(mocks: {
  mockSpawn: Mock
  mockSpawnSync: Mock
}): void {
  let origAppData: string | undefined
  beforeEach(async () => {
    harness.tmpRoot = mkdtempSync(
      path.join(os.tmpdir(), 'secrets-windows-test-'),
    )
    origAppData = process.env['APPDATA']
    process.env['APPDATA'] = harness.tmpRoot
    vi.resetModules()
    mocks.mockSpawn.mockReset()
    mocks.mockSpawnSync.mockReset()
  })
  afterEach(async () => {
    await safeDelete(harness.tmpRoot)
    if (origAppData === undefined) {
      delete process.env['APPDATA']
    } else {
      process.env['APPDATA'] = origAppData
    }
    vi.clearAllMocks()
  })
}
