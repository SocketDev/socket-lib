import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'

import { afterEach, beforeEach, vi } from 'vitest'

import type { Mock } from 'vitest'

export interface FakeChild extends EventEmitter {
  stdin: Writable
  stdout: Readable
  stderr: Readable
}

export function makeFakeChild(opts: {
  stdout?: string | undefined
  stderr?: string | undefined
  exitCode?: number | null | undefined
  emitError?: Error | undefined
}): FakeChild {
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
  return emitter
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
