/**
 * @file Unit tests for src/primordials/error — Error static primordials. Split
 *   out of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  ErrorCaptureStackTrace,
  ErrorPrepareStackTrace,
  ErrorStackTraceLimit,
} from '../../../src/primordials/error'

describe('Error (static)', () => {
  it('ErrorCaptureStackTrace attaches a `.stack` to a target object', () => {
    // Skip on JS engines without the V8 extension (none of our CI
    // targets, but keeps non-V8 importers safe).
    if (typeof ErrorCaptureStackTrace !== 'function') {
      return
    }
    const target: { stack?: string | undefined } = {}
    ErrorCaptureStackTrace(target)
    expect(typeof target.stack).toBe('string')
    expect(target.stack!.length).toBeGreaterThan(0)
  })

  it('ErrorCaptureStackTrace skips above `constructorOpt`', () => {
    if (typeof ErrorCaptureStackTrace !== 'function') {
      return
    }
    function inner(target: { stack?: string | undefined }): void {
      ErrorCaptureStackTrace!(target, inner)
    }
    const target: { stack?: string | undefined } = {}
    inner(target)
    // The frame for `inner` itself should NOT appear since we passed
    // it as `constructorOpt`.
    expect(target.stack!).not.toContain(' at inner ')
  })

  it('ErrorPrepareStackTrace mirrors the engine default at load time', () => {
    // V8 sets `Error.prepareStackTrace` to a function on Node 22+;
    // older engines leave it undefined. Either is correct for the
    // primordial — we just capture whatever the engine had.
    const live = (Error as { prepareStackTrace?: unknown | undefined })
      .prepareStackTrace
    expect(ErrorPrepareStackTrace).toBe(live)
  })

  it('ErrorStackTraceLimit returns the live limit', () => {
    // The function-shaped export reads the current value rather than
    // a snapshot, so user code that mutates `Error.stackTraceLimit`
    // sees the new value on the next call.
    const orig = Error.stackTraceLimit
    try {
      Error.stackTraceLimit = 5
      expect(ErrorStackTraceLimit()).toBe(5)
      Error.stackTraceLimit = 25
      expect(ErrorStackTraceLimit()).toBe(25)
    } finally {
      Error.stackTraceLimit = orig
    }
  })

  it('ErrorStackTraceLimit returns a number on V8 / undefined on non-V8', () => {
    const result = ErrorStackTraceLimit()
    // Either a finite number (V8 / Chromium / Node) or undefined
    // (non-V8 engines, where the property doesn't exist).
    expect(
      result === undefined ||
        (typeof result === 'number' && Number.isFinite(result)),
    ).toBe(true)
  })
})
