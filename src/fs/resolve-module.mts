/**
 * @file `require.resolve`-from-an-arbitrary-base. Node's bare
 *   `require.resolve(spec)` resolves relative to the calling module; these
 *   helpers resolve a specifier as if required from a DIFFERENT directory —
 *   useful for "find the copy of `typescript` that THIS project would load,"
 *   not the copy socket-lib itself loads. Returns the resolved absolute file
 *   path, or (in `nothrow` form) `undefined` when the specifier can't be
 *   resolved.
 */

import { getNodePath } from '../node/path.mjs'
import { getNodeModule } from '../node/module.mjs'
import { getNodeProcess } from '../node/process.mjs'

/**
 * Resolve a module specifier as if `require`'d from `fromDir`.
 *
 * Equivalent to running `require.resolve(specifier)` inside a module located at
 * `fromDir`. Accepts package specifiers (`'typescript'`, `'pkg/sub/path'`) and
 * relative paths (`'./foo'`).
 *
 * @example
 *   ;```ts
 *   // The `typescript` the project at /repo would load:
 *   requireResolveFrom('/repo', 'typescript')
 *   //=> '/repo/node_modules/typescript/lib/typescript.js'
 *
 *   requireResolveFrom('/repo', './missing', { nothrow: true })
 *   //=> undefined
 *   ```
 *
 * @param fromDir - Directory to resolve as if the require originated there.
 * @param specifier - Module specifier or relative path to resolve.
 * @param options - `nothrow: true` returns `undefined` instead of throwing.
 *
 * @returns Absolute resolved path (or `undefined` when `nothrow` and
 *   unresolved).
 *
 * @throws When the specifier can't be resolved and `nothrow` is not set.
 */
export function requireResolveFrom(
  fromDir: string,
  specifier: string,
  options: { nothrow: true },
): string | undefined
export function requireResolveFrom(
  fromDir: string,
  specifier: string,
  options?: { nothrow?: false | undefined } | undefined,
): string
export function requireResolveFrom(
  fromDir: string,
  specifier: string,
  options?: { nothrow?: boolean | undefined } | undefined,
): string | undefined {
  const { nothrow = false } = {
    __proto__: null,
    ...options,
  } as { nothrow?: boolean | undefined }
  const path = getNodePath()
  // getNodeModule().createRequire needs a FILE path as its anchor; appending a synthetic
  // filename makes a directory behave like the module doing the require.
  const anchor = path.join(path.resolve(fromDir), 'noop.js')
  try {
    const nodeModule = getNodeModule()
    return nodeModule.createRequire(anchor).resolve(specifier)
  } catch (e) {
    if (nothrow) {
      return undefined
    }
    throw e
  }
}

/**
 * Resolve a module specifier as if `require`'d from `process.cwd()`. Alias for
 * {@link requireResolveFrom} anchored at the current directory.
 *
 * @param specifier - Module specifier or relative path to resolve.
 * @param options - `nothrow: true` returns `undefined` instead of throwing.
 *
 * @returns Absolute resolved path (or `undefined` when `nothrow` and
 *   unresolved).
 */
export function requireResolveFromCwd(
  specifier: string,
  options: { nothrow: true },
): string | undefined
export function requireResolveFromCwd(
  specifier: string,
  options?: { nothrow?: false | undefined } | undefined,
): string
export function requireResolveFromCwd(
  specifier: string,
  options?: { nothrow?: boolean | undefined } | undefined,
): string | undefined {
  options = { __proto__: null, ...options } as typeof options
  const nodeProcess = getNodeProcess()
  return options?.nothrow
    ? requireResolveFrom(nodeProcess.cwd(), specifier, { nothrow: true })
    : requireResolveFrom(nodeProcess.cwd(), specifier)
}
