/**
 * @file Spawn error classification and enhancement. `isSpawnError` is a
 *   type-guard for shaping unknown errors that crossed an `await spawn(...)`.
 *   It checks for the `code` / `errno` / `syscall` properties that Node's
 *   child_process tags onto `ENOENT` / `EACCES` / process-exit failures.
 *   `isSpawnExitError` narrows further, to the failures whose process actually
 *   ran and exited — the ones whose `.code` is the NUMERIC exit status. That
 *   distinction is load-bearing: a spawn fails in two shapes, and a launch
 *   failure carries a string `.code` (`'ENOENT'`) while a non-zero exit carries
 *   a number. Both satisfy `isSpawnError`, so code reading `.code` as a number
 *   after that guard alone is wrong for half its inputs.
 *   `enhanceSpawnError` rewrites the upstream `@npmcli/promise-spawn` "command
 *   failed" placeholder message into something the operator can actually act
 *   on: command + args (truncated at 100 chars), exit code or signal, and the
 *   first stderr line (truncated at 200 chars). The stack is computed lazily on
 *   first access via a per-error WeakMap so non-error paths don't pay the
 *   `stackWithCauses` cost.
 */

import { isError } from '../../errors/predicates'
import { stackWithCauses } from '../../errors/stack'
import { hasOwn } from '../../objects/predicates'
import { ErrorCtor } from '../../primordials/error'
import {
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectGetOwnPropertyDescriptors,
} from '../../primordials/object'
import { ReflectDeleteProperty } from '../../primordials/reflect'
import { stackCache } from './shared'

import type { SpawnError } from './types'

/**
 * Enhances spawn error with better context. Converts generic "command failed"
 * to detailed error with command, exit code, and stderr.
 *
 * @example
 *   ;```typescript
 *   try {
 *     await spawn('git', ['status'])
 *   } catch (e) {
 *     throw enhanceSpawnError(e)
 *   }
 *   ```
 */
export function enhanceSpawnError(error: unknown): unknown {
  if (error === null || typeof error !== 'object') {
    return error
  }

  if (!isSpawnError(error)) {
    return error
  }

  const err = error as SpawnError
  const { args, cmd, code, signal, stderr } = err
  const stderrText =
    typeof stderr === 'string' ? stderr : (stderr?.toString() ?? '')

  // Build enhanced message.
  let enhancedMessage = `Command failed: ${cmd}`

  if (args && args.length > 0) {
    const argsStr = args.join(' ')
    if (argsStr.length < 100) {
      enhancedMessage += ` ${argsStr}`
    } else {
      enhancedMessage += ` ${argsStr.slice(0, 97)}...`
    }
  }

  // signal vs code arms exercised individually but not always paired.
  // Long-line stderr fallback (>=200 chars) fires only for verbose
  // child-process failures.
  /* c8 ignore start */
  if (signal) {
    enhancedMessage += ` (terminated by ${signal})`
  } else if (code !== undefined) {
    enhancedMessage += ` (exit code ${code})`
  }

  const trimmedStderr = stderrText.trim()
  if (trimmedStderr) {
    const firstLine = trimmedStderr.split('\n')[0] ?? ''
    if (firstLine.length < 200) {
      enhancedMessage += `\n${firstLine}`
    } else {
      enhancedMessage += `\n${firstLine.slice(0, 197)}...`
    }
  }
  /* c8 ignore stop */

  // Check if this is a synthetic error (generic "command failed" message).
  const isSynthetic = err.message === 'command failed'

  if (isSynthetic) {
    // Modify the error directly.
    ObjectDefineProperty(err, 'message', {
      __proto__: null,
      value: enhancedMessage,
      writable: true,
      enumerable: false,
      configurable: true,
    } as PropertyDescriptor)

    return err
  }

  // Create enhanced error with original error as cause.
  const enhancedError = new ErrorCtor(enhancedMessage, {
    cause: err,
  }) as SpawnError

  // Copy all spawn error properties except message and stack.
  const descriptors = ObjectGetOwnPropertyDescriptors(err)
  ReflectDeleteProperty(descriptors, 'message')
  ReflectDeleteProperty(descriptors, 'stack')
  ObjectDefineProperties(enhancedError, descriptors)

  // Build stack lazily on first access using WeakMap cache.
  ObjectDefineProperty(enhancedError, 'stack', {
    __proto__: null,
    configurable: true,
    enumerable: false,
    get() {
      let stack = stackCache.get(enhancedError)
      /* c8 ignore next - Lazy-init second-call branch on the per-error cache. */
      if (stack === undefined) {
        try {
          stack = stackWithCauses(err)
          /* c8 ignore start - stackWithCauses fallback for malformed
             error chains; new ErrorCtor().stack is also ?? '' for exotic
             runtimes that strip Error.stack. */
        } catch {
          stack = err.stack ?? new ErrorCtor().stack ?? ''
        }
        /* c8 ignore stop */
        stackCache.set(enhancedError, stack)
      }
      return stack
    },
  } as PropertyDescriptor)

  return enhancedError
}

/**
 * Check if a value is a spawn error with expected error properties. Tests for
 * common error properties from child process failures.
 *
 * @example
 *   try {
 *     await spawn('nonexistent-command')
 *   } catch (e) {
 *     if (isSpawnError(e)) {
 *       console.error(`Spawn failed: ${e.code}`)
 *     }
 *   }
 *
 * @param {unknown} value - Value to check.
 *
 * @returns {boolean} `true` if the value has spawn error properties
 */
export function isSpawnError(value: unknown): value is SpawnError {
  // Must be an Error. `isError` is cross-realm safe (it reads the
  // [[ErrorData]] slot rather than using `instanceof`), so a rejection that
  // crossed a realm boundary still narrows. A bare `typeof value === 'object'`
  // let any plain object carrying a `code` through, and this guard narrows to
  // a type declaring `message` / `stack` / `cmd`, none of which a plain object
  // has.
  if (!isError(value)) {
    return false
  }
  // Check for spawn-specific error properties.
  const err = value as unknown as Record<string, unknown>
  return (
    (hasOwn(err, 'code') && typeof err['code'] !== 'undefined') ||
    (hasOwn(err, 'errno') && typeof err['errno'] !== 'undefined') ||
    (hasOwn(err, 'syscall') && typeof err['syscall'] === 'string')
  )
}

/**
 * Narrow a caught value to a spawn failure whose process actually RAN and then
 * exited non-zero — the case where `.code` is the numeric exit status.
 *
 * `isSpawnError` alone is not enough for that. A spawn fails in two shapes and
 * they carry different `code` types:
 *
 * | failure                | `.code`    | type     |
 * | ---------------------- | ---------- | -------- |
 * | process exits non-zero | `3`        | `number` |
 * | command not found      | `'ENOENT'` | `string` |
 *
 * Both satisfy `isSpawnError`, so reading `.code` as a number after that guard
 * is wrong for the launch-failure case. Use this predicate when the exit status
 * is what you want, and {@link isErrnoException} when the launch failure is.
 *
 * @example
 *   try {
 *     await spawn('git', ['grep', '-q', needle])
 *   } catch (e) {
 *     // `git grep` exits 1 for "no match", which is an answer, not a failure.
 *     if (isSpawnExitError(e) && e.code === 1) {
 *       return false
 *     }
 *     throw e
 *   }
 */
export function isSpawnExitError(
  value: unknown,
): value is SpawnError & { code: number } {
  return isSpawnError(value) && typeof value.code === 'number'
}
