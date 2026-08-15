/**
 * @file PATH environment variable helpers. Exports `getPath()`, returning the
 *   raw value of the `PATH` environment variable that lists executable search
 *   directories, plus `findPathEnvKey()` and `replacePathInEnv()` for reading
 *   and rewriting that variable on an arbitrary environment object — Windows
 *   exposes it under a case-variant key, so a plain `env['PATH']` read or
 *   write is not enough.
 */

import { getEnvValue } from './rewire.mjs'

/**
 * Find the PATH key in an environment. Windows exposes it as `Path`, and a
 * merged environment object can carry any casing at all.
 *
 * @example
 *   ;```typescript
 *   findPathEnvKey({ Path: 'C:\\Windows' }) // 'Path'
 *   findPathEnvKey({}) // undefined
 *   ```
 */
export function findPathEnvKey(env: NodeJS.ProcessEnv): string | undefined {
  if (env['PATH'] !== undefined) {
    return 'PATH'
  }
  const keys = Object.keys(env)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    if (key.toLowerCase() === 'path') {
      return key
    }
  }
  return undefined
}

/**
 * Returns the value of the PATH environment variable.
 *
 * @example
 *   ;```typescript
 *   import { getPath } from '@socketsecurity/lib/env/path'
 *
 *   const path = getPath()
 *   // e.g. '/usr/local/bin:/usr/bin:/bin' or undefined
 *   ```
 *
 * @returns The system executable search paths, or `undefined` if not set
 */
export function getPath(): string | undefined {
  return getEnvValue('PATH')
}

/**
 * Copy an environment with its PATH replaced. Every case variant of the key is
 * rewritten so Windows cannot fall back to a stale `Path`.
 *
 * @example
 *   ;```typescript
 *   replacePathInEnv({ Path: 'C:\\a;C:\\b' }, 'C:\\a', 'Path')
 *   // { Path: 'C:\\a' }
 *   ```
 */
export function replacePathInEnv(
  env: NodeJS.ProcessEnv,
  searchPath: string,
  pathKey: string | undefined,
): NodeJS.ProcessEnv {
  const next = {
    __proto__: null,
    ...env,
  } as unknown as NodeJS.ProcessEnv
  const keys = Object.keys(next)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    if (key.toLowerCase() === 'path') {
      delete next[key]
    }
  }
  next[pathKey ?? 'PATH'] = searchPath
  return next
}
