/**
 * @file Sanitize the executable search path, then resolve against it. A tool
 *   running inside a checkout it did not author must never execute a `git` /
 *   `npm` / `node` that checkout supplied, so `resolveSanitizedExecutable`
 *   drops every PATH entry inside one directory tree — the "untrusted root",
 *   by default the current working directory — before searching, and hands
 *   back the cleaned `searchPath` + `env` alongside the resolved `binPath`
 *   and the `unsafeEntries` it removed. Implements the fleet's
 *   `untrusted-cwd` doctrine; the sibling leaves (`which`, `find`, `resolve`)
 *   are the unhardened lookups.
 *   Three separate ways a bare name reaches a checkout-supplied binary, all
 *   handled here:
 *
 *   1. The checkout's own directories sit on PATH — via `.envrc`, a wrapper
 *      script, or the `node_modules/.bin` a package-manager run script
 *      prepends. Every PATH entry whose realpath lands inside the untrusted
 *      root is dropped before the search starts.
 *   2. The upstream `which` package prepends `process.cwd()` to the search list on
 *      Windows, ahead of every real PATH entry, and resolves an empty PATH
 *      entry relative to the cwd on every platform. Passing an explicit `path`
 *      disables neither, so a hit counts only when its own directory is the
 *      PATH entry that was probed for it.
 *   3. A symlink in an otherwise trusted directory can point back into the
 *      checkout. The winning candidate is realpath'd and re-checked, and a
 *      trusted PATH entry that yields such a hit is treated as poisoned — it is
 *      dropped from the sanitized environment rather than merely skipped,
 *      because one attacker-planted entry proves write access to the directory.
 *      The return value carries a sanitized environment whose PATH holds only
 *      the surviving entries. Pass it to the child so a shell, a `PATHEXT`
 *      re-search, or the child's own sub-spawns cannot reach a dropped
 *      directory either.
 */

import process from 'node:process'

import { findPathEnvKey, replacePathInEnv } from '../../env/path'
import { readRealPath } from '../../fs/inspect'
import { findOutermostGitRoot } from '../../git/repo'
import { getNodePath } from '../../node/path'
import { foldPathForCompare, isPath } from '../../paths/normalize'
import { isPathWithinRoot } from '../../paths/predicates'
import { ArrayIsArray } from '../../primordials/array'
import { stripSurroundingQuotes } from '../../strings/transform'

import { isShadowBinPath } from '../shadow/detect'
import { whichSync } from './which'

/**
 * Options for {@link resolveSanitizedExecutable}.
 */
export interface SanitizedExecutableOptions {
  /**
   * Environment to read PATH from and to sanitize. Default `process.env`.
   */
  env?: NodeJS.ProcessEnv | undefined
  /**
   * Drop `node_modules/.bin` directories from the search path. Default `true`.
   */
  excludeShadowBins?: boolean | undefined
  /**
   * Windows executable extensions, passed through to the PATH search.
   */
  pathExt?: string | undefined
  /**
   * Directory tree treated as hostile. Default `process.cwd()`. A value that
   * resolves to a filesystem root is ignored — protecting `/` would drop every
   * PATH entry.
   */
  untrustedRoot?: string | undefined
  /**
   * What to do when no trusted PATH entry supplies the command.
   *
   * - `'none'` (default) — report no `binPath`.
   * - `'shadowBins'` — accept a hit from a dropped `node_modules/.bin`. This is
   *   the package-manager compatibility case: a run script prepends the
   *   workspace's `.bin`, and a dev-dependency CLI lives nowhere else.
   * - `'all'` — accept a hit from any dropped entry.
   *
   * A POISONED entry is never a fallback under any setting: a trusted
   * directory that was tampered with is not a compatibility case. The result is
   * reported with `trusted: false` and the sanitized environment still excludes
   * every dropped entry.
   */
  untrustedFallback?: 'all' | 'none' | 'shadowBins' | undefined
  /**
   * Expand the untrusted root upward to the OUTERMOST ancestor holding a `.git`
   * marker, so a nested worktree or submodule cannot escape through its parent.
   * Opt-in: applied implicitly it would mark a trusted monorepo hostile the
   * moment a command runs from one of its packages. Default `false`.
   */
  useOutermostGitRoot?: boolean | undefined
}

/**
 * Result of {@link resolveSanitizedExecutable}.
 */
export interface SanitizedExecutableResult {
  /**
   * Absolute path to the executable, as the PATH search produced it, or
   * `undefined` when the command exists nowhere the resolver is willing to
   * look. Symlinks are preserved — only the trust check runs against the
   * realpath — so a Homebrew or nvm shim still spawns through its usual
   * wrapper.
   */
  binPath: string | undefined
  /**
   * Copy of the input environment with PATH replaced by {@link searchPath}.
   */
  env: NodeJS.ProcessEnv
  /**
   * Delimiter-joined trusted PATH entries.
   */
  searchPath: string
  /**
   * `true` when `binPath` came from a trusted PATH entry. Always `false` when
   * `binPath` is `undefined`.
   */
  trusted: boolean
  /**
   * PATH entries excluded from {@link searchPath}, in their original order.
   */
  unsafeEntries: string[]
}

/**
 * Report whether an explicitly-named target sits outside the untrusted root.
 *
 * @example
 *   ;```typescript
 *   isTrustedTarget('/usr/bin/git', '/repo') // true
 *   ```
 */
export function isTrustedTarget(
  target: string,
  untrustedRoot: string | undefined,
): boolean {
  if (!untrustedRoot) {
    return true
  }
  const real = readRealPath(target)
  return !real || !isPathWithinRoot(real, untrustedRoot)
}

/**
 * Search PATH entries one at a time so every hit can be attributed to the entry
 * that produced it. Entries whose hit realpaths into `untrustedRoot` are added
 * to `poisoned` and skipped.
 *
 * @example
 *   ;```typescript
 *   probePathEntries('git', ['/usr/bin'], '/repo', new Set(), undefined)
 *   // '/usr/bin/git'
 *   ```
 */
export function probePathEntries(
  command: string,
  entries: readonly string[],
  untrustedRoot: string | undefined,
  poisoned: Set<string>,
  pathExt: string | undefined,
): string | undefined {
  const path = getNodePath()
  for (const entry of entries) {
    const found = whichSync(command, {
      all: true,
      nothrow: true,
      path: entry,
      ...(pathExt ? { pathExt } : {}),
    })
    const hits = ArrayIsArray(found)
      ? found
      : typeof found === 'string'
        ? [found]
        : []
    let entryPoisoned = false
    for (const hit of hits) {
      // `which` builds each candidate as `join(entry, command) + ext`, so a hit
      // from the probed entry has that entry as its lexical dirname. Anything
      // else came from the Windows cwd prepend, which no option disables.
      if (foldPathForCompare(path.dirname(hit)) !== foldPathForCompare(entry)) {
        continue
      }
      const real = readRealPath(hit)
      if (!real) {
        continue
      }
      if (untrustedRoot && isPathWithinRoot(real, untrustedRoot)) {
        entryPoisoned = true
        break
      }
      return hit
    }
    if (entryPoisoned) {
      poisoned.add(entry)
    }
  }
  return undefined
}

/**
 * Resolve a bare command name to an executable the untrusted root could not
 * have supplied.
 *
 * `binPath` is `undefined` when the command exists nowhere the resolver is
 * willing to look; the sanitized environment is returned either way, and a
 * caller that falls back to spawning the bare name must hand that environment
 * to the child or the operating system's own search reopens the hole.
 *
 * @example
 *   ;```typescript
 *   const resolved = resolveSanitizedExecutable('git', {
 *     untrustedRoot: '/scan/target',
 *   })
 *   // resolved.binPath  → '/usr/bin/git'
 *   // resolved.env.PATH → PATH minus every entry under /scan/target
 *   ```
 */
export function resolveSanitizedExecutable(
  command: string,
  options?: SanitizedExecutableOptions | undefined,
): SanitizedExecutableResult {
  const opts = { __proto__: null, ...options } as SanitizedExecutableOptions
  const {
    excludeShadowBins = true,
    pathExt,
    untrustedFallback = 'none',
    useOutermostGitRoot = false,
  } = opts
  const path = getNodePath()
  const env = opts.env ?? process.env
  const pathKey = findPathEnvKey(env)
  const rawPath = (pathKey ? env[pathKey] : undefined) ?? ''
  const untrustedRoot = resolveUntrustedRoot(
    opts.untrustedRoot ?? process.cwd(),
    { useOutermostGitRoot },
  )

  const searchableEntries: string[] = []
  const trustedEntries: string[] = []
  const unsafeEntries: string[] = []
  const rawEntries = rawPath.split(path.delimiter)
  for (let i = 0, { length } = rawEntries; i < length; i += 1) {
    const rawEntry = rawEntries[i]!
    const entry = stripSurroundingQuotes(rawEntry)
    // An empty entry, a bare `.`, or any relative entry resolves against the
    // process cwd inside `which` — the very directory under attack.
    if (!entry || entry === '.' || !path.isAbsolute(entry)) {
      unsafeEntries.push(rawEntry)
      continue
    }
    searchableEntries.push(entry)
    const real = readRealPath(entry)
    if (
      !real ||
      (untrustedRoot && isPathWithinRoot(real, untrustedRoot)) ||
      (excludeShadowBins && (isShadowBinPath(entry) || isShadowBinPath(real)))
    ) {
      unsafeEntries.push(rawEntry)
      continue
    }
    trustedEntries.push(entry)
  }

  const poisoned = new Set<string>()
  let binPath: string | undefined
  let trusted = true
  if (isPath(command)) {
    binPath = path.resolve(command)
    trusted = isTrustedTarget(binPath, untrustedRoot)
  } else {
    binPath = probePathEntries(
      command,
      trustedEntries,
      untrustedRoot,
      poisoned,
      pathExt,
    )
    if (!binPath && untrustedFallback !== 'none') {
      // Every remaining candidate lives in a dropped directory. Search those
      // with the same per-entry attribution so the Windows cwd prepend and
      // cwd-relative empty entries stay unreachable on the fallback path too.
      binPath = probePathEntries(
        command,
        searchableEntries.filter(
          entry =>
            !poisoned.has(entry) &&
            (untrustedFallback === 'all' ||
              isShadowBinPath(entry) ||
              isShadowBinPath(readRealPath(entry))),
        ),
        undefined,
        new Set<string>(),
        pathExt,
      )
      trusted = false
    }
    if (!binPath) {
      trusted = false
    }
  }

  const searchPath = trustedEntries
    .filter(entry => !poisoned.has(entry))
    .join(path.delimiter)
  return {
    binPath,
    env: replacePathInEnv(env, searchPath, pathKey),
    searchPath,
    trusted,
    unsafeEntries: [...unsafeEntries, ...poisoned],
  }
}

/**
 * Resolve the untrusted root to a realpath, widening to the outermost `.git`
 * ancestor when asked. Returns `undefined` for a filesystem root, which would
 * otherwise drop every PATH entry.
 *
 * @example
 *   ;```typescript
 *   resolveUntrustedRoot('/repo/src') // '/repo/src'
 *   resolveUntrustedRoot('/') // undefined
 *   ```
 */
export function resolveUntrustedRoot(
  root: string,
  options?: { useOutermostGitRoot?: boolean | undefined } | undefined,
): string | undefined {
  const opts = { __proto__: null, ...options } as {
    useOutermostGitRoot?: boolean | undefined
  }
  const path = getNodePath()
  const real = readRealPath(root)
  if (!real) {
    return undefined
  }
  const widened = opts.useOutermostGitRoot
    ? (readRealPath(findOutermostGitRoot(real)) ?? real)
    : real
  return path.dirname(widened) === widened ? undefined : widened
}
