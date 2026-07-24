/**
 * @file Process-method interceptors — `processEmit` replaces `process.emit` and
 *   `processReallyExit` replaces `process.reallyExit` while `load()` is active.
 *   Both forward to the originals captured in `_internal` and broadcast `exit`
 *   / `afterexit` through the signal-exit emitter.
 */

import { ErrorCtor } from '../../primordials/error'
import { ReflectApply } from '../../primordials/reflect'

import {
  emit,
  globalProcess,
  originalProcessEmit,
  originalProcessReallyExit,
} from './_internal'

/* c8 ignore start - processEmit + processReallyExit interceptors
   only fire on real process exit/emit; can't be triggered in-test. */
export function processEmit(
  this: NodeJS.Process,
  eventName: string,
  exitCode?: number | undefined,
  ...args: unknown[]
): boolean {
  if (eventName === 'exit') {
    let actualExitCode = exitCode
    if (actualExitCode === undefined) {
      const processExitCode = globalProcess?.exitCode
      actualExitCode =
        typeof processExitCode === 'number' ? processExitCode : undefined
    } else if (globalProcess) {
      globalProcess.exitCode = actualExitCode
    }
    const result = ReflectApply(
      originalProcessEmit as (...args: unknown[]) => boolean,
      this,
      [eventName, actualExitCode, ...args],
    ) as boolean
    const numExitCode =
      typeof actualExitCode === 'number' ? actualExitCode : undefined
    emit('exit', numExitCode, undefined)
    emit('afterexit', numExitCode, undefined)
    return result
  }
  return ReflectApply(
    originalProcessEmit as (...args: unknown[]) => boolean,
    this,
    [eventName, exitCode, ...args],
  ) as boolean
}

export function processReallyExit(code?: number | undefined): never {
  const exitCode = code || 0
  if (globalProcess) {
    globalProcess.exitCode = exitCode
  }
  emit('exit', exitCode, undefined)
  emit('afterexit', exitCode, undefined)
  ReflectApply(
    originalProcessReallyExit as (code?: number | undefined) => never,
    globalProcess,
    [exitCode],
  )
  throw new ErrorCtor('processReallyExit should never return')
}
/* c8 ignore stop */
