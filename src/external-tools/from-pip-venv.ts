/**
 * @file Generic "venv-install tier" for external-tools resolvers. Parallel to
 *   `from-download.ts` — that one handles single-binary tools downloaded as
 *   GitHub release assets; this one handles Python packages installed into a
 *   single-purpose venv. Per-tool resolvers (skillspector, future Python CLIs)
 *   compose their fourth tier on top of these helpers. Two helpers:
 *
 *   - `createPipVenv` — `python -m venv <cacheDir>` + `pip install <spec>`.
 *     Idempotent: hits the existing venv when its entry-point already exists.
 *     Stops at "venv created, entry-point present."
 *   - `findPython` — locates `python3` (or `python` on Windows) on PATH. Returns
 *     the absolute path or `undefined` when no Python is available. What this
 *     does NOT do:
 *   - Decide where the venv lives. The caller picks the cache dir (typically
 *     under `getSocketDlxDir()`); we just create the venv there.
 *   - Verify package integrity beyond pip's own wheel-hash mechanism. Pinning is
 *     the caller's responsibility: pass exact-version `<pkg>==<ver>` or git-SHA
 *     `git+...@<sha>`.
 *   - Re-resolve when the cache is stale. The cache key is derived by the caller
 *     from the install spec; a re-pin produces a new dir.
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { which } from '../bin/which'
import { safeMkdir } from '../fs/safe'
import { spawn } from '../process/spawn/child'

export interface CreatePipVenvOptions {
  /**
   * Absolute path to the venv directory. Created if missing; reused if the
   * entry-point already exists inside it.
   */
  readonly cacheDir: string
  /**
   * Name of the entry-point executable. Matches the package's
   * `[project.scripts]` key (or the package name when it's the same).
   */
  readonly entryPoint: string
  /**
   * Pip-install argument — either `<pkg>==<version>` (PyPI exact pin) or
   * `git+<https-url>@<sha>` (git-SHA pin). Anything else is rejected.
   */
  readonly installSpec: string
  /**
   * Optional override for the Python interpreter. Defaults to
   * {@link findPython}.
   */
  readonly python?: string | undefined
}

export interface CreatePipVenvResult {
  /**
   * Absolute path to the entry-point binary inside the venv. Always set when
   * `created` or the cache was already populated.
   */
  readonly entryPointPath: string
  /**
   * `true` when this call created the venv (and ran pip install); `false` when
   * the existing cache was reused.
   */
  readonly created: boolean
}

/**
 * Create (or reuse) a venv at `cacheDir` and pip-install `installSpec` into it.
 * Returns the entry-point path + a `created` flag. Throws when:
 *
 * - No Python interpreter is on PATH (and none was passed via `python`).
 * - `python -m venv` fails.
 * - `pip install` fails.
 * - The install succeeded but the entry-point was not created (caller passed a
 *   wrong `entryPoint` name, or the package has no console script).
 */
export async function createPipVenv(
  options: CreatePipVenvOptions,
): Promise<CreatePipVenvResult> {
  options = { __proto__: null, ...options } as typeof options
  const { cacheDir, entryPoint, installSpec } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entryBin = pipVenvEntryPointPath(cacheDir, entryPoint)

  // Cache hit: existing venv, existing entry-point. Skip install.
  if (existsSync(entryBin)) {
    return { entryPointPath: entryBin, created: false }
  }

  const python = options.python ?? (await findPython())
  if (!python) {
    throw new Error(
      'createPipVenv: no Python interpreter on PATH (looked for python3, python)',
    )
  }

  await safeMkdir(path.dirname(cacheDir), { recursive: true })

  // Create the venv. `--clear` makes the call idempotent — if the dir
  // exists but is stale (partial install from a previous crash), it
  // wipes and recreates.
  await spawn(python, ['-m', 'venv', '--clear', cacheDir], { stdio: 'pipe' })

  // pip-install inside the venv. Use the venv's own pip so the host
  // site-packages is untouched. `--no-input` prevents interactive
  // prompts in non-TTY contexts (CI / scripts).
  const venvPython = pipVenvEntryPointPath(cacheDir, 'python')
  if (!existsSync(venvPython)) {
    throw new Error(
      `createPipVenv: venv created at ${cacheDir} but ${venvPython} is missing`,
    )
  }
  await spawn(
    venvPython,
    [
      '-m',
      'pip',
      'install',
      '--no-input',
      '--disable-pip-version-check',
      installSpec,
    ],
    { stdio: 'pipe' },
  )

  if (!existsSync(entryBin)) {
    throw new Error(
      `createPipVenv: pip install ${installSpec} succeeded but entry-point ${entryPoint} was not created at ${entryBin}`,
    )
  }
  return { entryPointPath: entryBin, created: true }
}

/**
 * Locate a Python interpreter. Prefer `python3` on macOS/Linux, fall back to
 * `python` (the Windows convention). Returns `undefined` when neither is on
 * PATH.
 */
export async function findPython(): Promise<string | undefined> {
  const candidates =
    process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python']
  for (let i = 0, { length } = candidates; i < length; i += 1) {
    const found = await which(candidates[i]!, { nothrow: true })
    if (typeof found === 'string') {
      return found
    }
  }
  return undefined
}

// Per-platform venv layout. On Windows the entry-point lives under
// `Scripts/<name>.exe`; on Unix it's `bin/<name>`.
export function pipVenvEntryPointPath(
  venvDir: string,
  entryPoint: string,
): string {
  if (process.platform === 'win32') {
    return path.join(venvDir, 'Scripts', `${entryPoint}.exe`)
  }
  return path.join(venvDir, 'bin', entryPoint)
}
