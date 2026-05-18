/**
 * @file Inject fs-operation errors at specific paths so tests can exercise
 *   catch branches that only fire on EACCES / EPERM / EROFS / EBUSY / ENOENT /
 *   ENOTEMPTY. Two flavors:
 *
 *   - mockFsError({ path, op, code }) — set up a vi.spy that throws on the next
 *     call matching path + op, restore afterward.
 *   - mockFsErrorOnce(...) — same but only intercepts the FIRST call. Reset is
 *     automatic via afterEach if `withFsErrors` describe-helper is used,
 *     otherwise call the returned `restore` function from a finally block. Why
 *     path-scoped: blanket `vi.spyOn(fs, 'unlinkSync')` breaks every unrelated
 *     unlink in the SUT (logger setup, tmp-dir cleanup, etc.). Filter on the
 *     first arg so only the targeted path errors out.
 */

import * as fsBuiltin from 'node:fs'
import * as fsPromisesBuiltin from 'node:fs/promises'

import { vi } from 'vitest'

type SyncOp =
  | 'chmodSync'
  | 'existsSync'
  | 'mkdirSync'
  | 'readFileSync'
  | 'readdirSync'
  | 'renameSync'
  | 'rmSync'
  | 'rmdirSync'
  | 'statSync'
  | 'unlinkSync'
  | 'utimesSync'
  | 'writeFileSync'

type AsyncOp = 'readFile' | 'rm' | 'stat' | 'unlink' | 'writeFile'

export type FsErrorCode =
  | 'EACCES'
  | 'EBUSY'
  | 'EEXIST'
  | 'ENOENT'
  | 'ENOTEMPTY'
  | 'EPERM'
  | 'EROFS'

export interface FsErrorSpec {
  /**
   * Absolute path to fail on (string match against the first arg of the fs
   * call).
   */
  path: string
  /**
   * Fs sync method name (e.g. 'unlinkSync', 'writeFileSync').
   */
  op: SyncOp
  /**
   * Errno code to attach to the thrown error.
   */
  code: FsErrorCode
  /**
   * If true, only intercept the first call. Subsequent calls fall through to
   * the real implementation. Default: false (every call matching the path
   * errors until restore).
   */
  once?: boolean
}

export interface FsAsyncErrorSpec {
  path: string
  op: AsyncOp
  code: FsErrorCode
  once?: boolean
}

export function makeErrnoError(
  code: FsErrorCode,
  op: string,
  path: string,
): Error {
  const e = new Error(
    `${code}: simulated ${op} failure on ${path}`,
  ) as Error & {
    code: FsErrorCode
    syscall: string
    path: string
    errno: number
  }
  e.code = code
  e.syscall = op
  e.path = path
  e.errno = -13
  return e
}

/**
 * Async variant — spies on `fs.promises.<op>`. Same path-scoped match, but
 * throws via a rejected Promise.
 */
export function mockFsAsyncError(spec: FsAsyncErrorSpec): () => void {
  const target = fsPromisesBuiltin as unknown as Record<string, unknown>
  const original = target[spec.op] as (...args: unknown[]) => unknown
  if (typeof original !== 'function') {
    throw new Error(`fs.promises.${spec.op} is not a function`)
  }
  let used = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spy: any = vi
    .spyOn(fsPromisesBuiltin as never, spec.op as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation(async (...args: any[]) => {
      const argPath = typeof args[0] === 'string' ? args[0] : String(args[0])
      const matches = argPath === spec.path || argPath.startsWith(spec.path)
      if (!matches || (spec.once && used)) {
        return await original(...args)
      }
      used = true
      throw makeErrnoError(spec.code, spec.op, spec.path)
    })
  return () => {
    spy.mockRestore()
  }
}

/**
 * Spy on a sync fs method so calls matching `spec.path` throw an errno-typed
 * Error. Returns a restore function the caller must invoke (in a finally block
 * or afterEach) to undo the spy.
 */
export function mockFsError(spec: FsErrorSpec): () => void {
  const target = fsBuiltin as unknown as Record<string, unknown>
  const original = target[spec.op] as (...args: unknown[]) => unknown
  if (typeof original !== 'function') {
    throw new Error(`fs.${spec.op} is not a function`)
  }
  let used = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const spy: any = vi
    .spyOn(fsBuiltin as never, spec.op as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation((...args: any[]) => {
      const argPath = typeof args[0] === 'string' ? args[0] : String(args[0])
      const matches = argPath === spec.path || argPath.startsWith(spec.path)
      if (!matches || (spec.once && used)) {
        return original(...args)
      }
      used = true
      throw makeErrnoError(spec.code, spec.op, spec.path)
    })
  return () => {
    spy.mockRestore()
  }
}
