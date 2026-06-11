/**
 * @file Tests for primordials/process — the call-through accessors. Verifies
 *   the two design properties: (1) a `vi.spyOn(process, 'cwd')` STILL
 *   intercepts (late call preserves mockability), and (2) reading goes through
 *   the captured process object (the real values surface).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  processArch,
  processArgv,
  processCwd,
  processEmitWarning,
  processEnv,
  processExecPath,
  processNextTick,
  processPid,
  processPlatform,
  processStderr,
  processStdout,
  processVersion,
} from '../../../src/primordials/process'

describe('primordials/process', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the real process values', () => {
    expect(processCwd()).toBe(process.cwd())
    expect(processPlatform()).toBe(process.platform)
    expect(processEnv()).toBe(process.env)
    expect(processArgv()).toBe(process.argv)
    expect(processArch()).toBe(process.arch)
    expect(processExecPath()).toBe(process.execPath)
    expect(processPid()).toBe(process.pid)
    expect(processVersion()).toBe(process.version)
    expect(processStdout()).toBe(process.stdout)
    expect(processStderr()).toBe(process.stderr)
  })

  it('processCwd stays mockable via vi.spyOn (the late-call property)', () => {
    const spy = vi.spyOn(process, 'cwd').mockReturnValue('/mocked/dir')
    // The accessor calls process.cwd at call time, so the spy intercepts.
    expect(processCwd()).toBe('/mocked/dir')
    expect(spy).toHaveBeenCalled()
  })

  it('processEmitWarning delegates to process.emitWarning', () => {
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => {})
    processEmitWarning('a deprecation note')
    expect(spy).toHaveBeenCalledWith('a deprecation note')
  })

  it('processNextTick delegates to process.nextTick', () => {
    const spy = vi.spyOn(process, 'nextTick').mockImplementation(() => {})
    const cb = (): void => {}
    processNextTick(cb)
    expect(spy).toHaveBeenCalledWith(cb)
  })
})
