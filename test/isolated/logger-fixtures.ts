/**
 * @file Shared test fixtures for the logger test files. The logger suite was
 *   originally a single 1200-line file that tripped `socket/max-file-lines`
 *   (1000-line hard cap). It is now split across two sibling `*.test.mts` files
 *   (`logger.test.mts` covers the core logging surface; the LOG_SYMBOLS and
 *   internal-symbol coverage lives alongside it). This module owns the shared
 *   capturing-stream helpers so neither file duplicates the typed Writable
 *   plumbing. `createCaptureStream()` builds a `node:stream` Writable whose
 *   `write` pushes each chunk's string form into the provided sink array and
 *   then signals completion. The returned object is a `MockStream` — a Writable
 *   widened with the optional TTY fields the Logger probes (`isTTY`,
 *   `cursorTo`, `clearLine`). Tests assign those fields directly on the typed
 *   object instead of casting through `any`.
 */

import { Writable } from 'node:stream'

import { afterEach, beforeEach } from 'vitest'

// oxlint-disable-next-line socket/no-platform-specific-import -- the isolated vitest config resolves only the explicit /node file; the barrel has no index.ts and exports-map resolution isn't wired for relative/aliased imports here.
import { Logger } from '../../src/logger/node'

/**
 * Callback shape Node passes to a Writable's `write` implementation. Invoke it
 * with no arguments to signal the chunk was consumed successfully.
 */
export type WriteCallback = (error?: Error | null | undefined) => void

/**
 * A capturing Writable widened with the optional terminal fields the Logger
 * reads when deciding whether it is attached to a TTY. The Logger only ever
 * reads these, so they are optional and tests set the ones a given case needs.
 */
export type MockStream = Writable & {
  isTTY?: boolean | undefined
  cursorTo?: ((x: number, y?: number) => boolean) | undefined
  clearLine?: ((dir: -1 | 0 | 1) => boolean) | undefined
}

/**
 * Build a Writable that records every chunk written to it into `sink` as a
 * string. When `sink` is omitted the stream still drains correctly but keeps no
 * record — useful for cases that only need a live, non-throwing stream.
 */
export function createCaptureStream(sink?: string[] | undefined): MockStream {
  const stream = new Writable({
    write(chunk: unknown, _encoding: BufferEncoding, callback: WriteCallback) {
      if (sink) {
        sink.push(String(chunk))
      }
      callback()
    },
  })
  return stream as MockStream
}

/**
 * Live state for a Logger test harness. `testLogger` writes to non-TTY capture
 * streams whose output lands in `stdoutChunks` / `stderrChunks`. Fields are
 * reassigned by `setupLoggerHarness()`'s `beforeEach` hook, so tests must read
 * them through the returned object rather than destructuring at module scope.
 */
export type LoggerHarness = {
  testLogger: Logger
  stdoutChunks: string[]
  stderrChunks: string[]
  mockStdout: MockStream
  mockStderr: MockStream
}

/**
 * Install vitest `beforeEach` / `afterEach` hooks in the caller's describe
 * scope that build a fresh non-TTY Logger backed by capture streams. Returns
 * the live harness object; its fields refresh before every test.
 */
export function setupLoggerHarness(): LoggerHarness {
  const harness: LoggerHarness = {
    testLogger: undefined as unknown as Logger,
    stdoutChunks: [],
    stderrChunks: [],
    mockStdout: undefined as unknown as MockStream,
    mockStderr: undefined as unknown as MockStream,
  }

  beforeEach(() => {
    harness.stdoutChunks = []
    harness.stderrChunks = []

    harness.mockStdout = createCaptureStream(harness.stdoutChunks)
    harness.mockStdout.isTTY = false

    harness.mockStderr = createCaptureStream(harness.stderrChunks)
    harness.mockStderr.isTTY = false

    harness.testLogger = new Logger({
      stdout: harness.mockStdout,
      stderr: harness.mockStderr,
    })
  })

  afterEach(() => {
    harness.stdoutChunks = []
    harness.stderrChunks = []
  })

  return harness
}
