/**
 * @file Uv project install helpers — the locked-source-of-truth half of the
 *   "uv project + dlx materialize" model.
 *   uv (Astral's Python package manager) drives a uv PROJECT — a directory with
 *   `pyproject.toml` + `uv.lock` (+ optional `[tool.uv] exclude-newer`). The
 *   lock manifests every transitive version, so the project is the most
 *   locked-down, most-version-pinned form a Python tool install can take.
 *   Two entry points, used together:
 *
 *   1. `uvSyncProject` — `uv sync --locked --project <dir>`. Installs the lock's
 *      exact closure into the project's own `.venv` and FAILS if `uv.lock` is
 *      out of date vs `pyproject.toml` (the `--locked` gate). This is the
 *      verification-grade install: it proves the lock resolves.
 *   2. `uvExportMaterialize` — `uv export --locked` → a flat, hash-pinned
 *      requirements list, then `uv pip install --target <dir>` into a
 *      content-addressed dlx dir (no venv → no symlinks / absolute `home=`, so
 *      the result is relocatable + SEA-VFS-embeddable). Mirrors
 *      `downloadPipPackage`'s lock-guarded, idempotent shape. Both take an
 *      explicit `uvBin` (typically `resolveUv().path`) and never mutate a
 *      shared interpreter — the project venv and the dlx target are
 *      self-contained.
 */

// oxlint-disable-next-line socket/prefer-async-spawn -- uv needs streaming stdio; the lib promise wrapper rejects on nonzero and hides output.
import { spawn } from '../../process/spawn/child'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { WIN32 } from '../../constants/platform'
import { safeDelete, safeMkdir } from '../../fs/safe'
import { getSocketDlxDir } from '../../paths/socket'

import { generateCacheKey } from '../../dlx/cache'

import { isAlreadyInstalled, isStaleLock } from './pip-install'

const MAX_RETRIES = 3
const WAIT_TICKS = 30

/**
 * Export a uv project's locked closure to a flat requirements list, then
 * `uv pip install --target` it into a content-addressed dlx dir. The dlx dir
 * holds plain files (no venv), so it is relocatable and embeddable in a smol
 * binary's VFS — the bundle-safe analog of `uvSyncProject`'s `.venv`.
 *
 * Lock-guarded + idempotent (reuses `pip-install`'s `isAlreadyInstalled` /
 * `isStaleLock`): a non-empty target dir short-circuits, and concurrent callers
 * serialize on a `.installing` sentinel one level up from the target. Throws on
 * a failed uv command or if the lock can't be acquired after MAX_RETRIES.
 */
export async function uvExportMaterialize(
  options: UvExportMaterializeOptions,
  retryCount = 0,
): Promise<UvExportMaterializeResult> {
  const opts = { __proto__: null, ...options } as UvExportMaterializeOptions
  const { projectDir, uvBin } = opts
  const targetDir = opts.targetDir ?? uvProjectTargetDir(projectDir)
  if (retryCount >= MAX_RETRIES) {
    throw new Error(
      `uvExportMaterialize: could not acquire install lock after ${MAX_RETRIES} retries for ${targetDir}; a peer may be stuck or the lock is stale — remove it and retry`,
    )
  }
  if (await isAlreadyInstalled(targetDir)) {
    return { installed: false, targetDir }
  }
  // The lock lives one level up so a wipe of targetDir can't delete it
  // mid-install (same placement as downloadPipPackage).
  const lockDir = path.dirname(targetDir)
  await safeMkdir(lockDir, { recursive: true })
  const lockFile = path.join(lockDir, '.installing')

  try {
    await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' })
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code !== 'EEXIST') {
      throw e
    }
    let stale = false
    try {
      const pid = Number.parseInt(
        (await fs.readFile(lockFile, 'utf8')).trim(),
        10,
      )
      stale = isStaleLock(pid)
    } catch {
      stale = true
    }
    if (stale) {
      await safeDelete(lockFile, { force: true })
      return uvExportMaterialize(options, retryCount + 1)
    }
    for (let i = 0; i < WAIT_TICKS; i += 1) {
      await new Promise(resolve => {
        setTimeout(resolve, 1000)
      })
      if (await isAlreadyInstalled(targetDir)) {
        return { installed: false, targetDir }
      }
    }
    return uvExportMaterialize(options, retryCount + 1)
  }

  try {
    await safeMkdir(targetDir, { recursive: true })
    const requirementsPath = path.join(lockDir, 'requirements.locked.txt')
    // `uv export --locked` writes the lock's full pinned closure (with hashes)
    // as a requirements file; `--no-emit-project` drops the project's own
    // editable root so only the dependency closure is materialized.
    await spawn(
      uvBin,
      [
        'export',
        '--locked',
        '--no-emit-project',
        '--no-dev',
        '--project',
        projectDir,
        '--output-file',
        requirementsPath,
      ],
      { shell: WIN32, stdio: 'inherit' },
    )
    // `uv pip install --target` lays the closure down as plain files — no venv,
    // no symlinks, no absolute `home=` — so the result is relocatable and
    // VFS-embeddable. `--require-hashes` is implied by the exported hashes.
    await spawn(
      uvBin,
      [
        'pip',
        'install',
        '--target',
        targetDir,
        '--requirement',
        requirementsPath,
      ],
      { shell: WIN32, stdio: 'inherit' },
    )
    await safeDelete(requirementsPath, { force: true })
    if (!(await isAlreadyInstalled(targetDir))) {
      throw new Error(
        `uvExportMaterialize: uv pip install --target ${targetDir} reported success but the target is still empty`,
      )
    }
    return { installed: true, targetDir }
  } finally {
    await safeDelete(lockFile, { force: true })
  }
}

/**
 * Content-addressed dlx dir for a uv project's materialized closure:
 * `~/.socket/_dlx/<cacheKey(projectDir)>/site-packages`. Keyed on the project
 * dir so each project gets an isolated target; the analog of `pipPackageDir`.
 */
export function uvProjectTargetDir(projectDir: string): string {
  return path.join(
    getSocketDlxDir(),
    generateCacheKey(projectDir),
    'site-packages',
  )
}

/**
 * Run `uv sync --locked` against a uv project. Installs the lock's exact
 * dependency closure into the project's `.venv`; the `--locked` flag turns a
 * lock-vs-manifest drift into a hard failure (uv exits non-zero) rather than a
 * silent re-resolution — this is what makes it verification-grade. Throws when
 * uv exits non-zero (drift, missing lock, or a resolution failure).
 */
export async function uvSyncProject(
  options: UvSyncProjectOptions,
): Promise<void> {
  const opts = { __proto__: null, ...options } as UvSyncProjectOptions
  const { projectDir, uvBin } = opts
  // `--locked` is non-negotiable for a verification-grade sync: without it uv
  // would silently rewrite uv.lock when it drifts from pyproject.toml.
  const lockedArgs = opts.locked === false ? [] : ['--locked']
  await spawn(uvBin, ['sync', ...lockedArgs, '--project', projectDir], {
    shell: WIN32,
    stdio: 'inherit',
  })
}

export interface UvSyncProjectOptions {
  /**
   * Absolute path to the `uv` executable (typically `resolveUv().path`).
   */
  readonly uvBin: string
  /**
   * Absolute path to the uv project dir (holds `pyproject.toml` + `uv.lock`).
   */
  readonly projectDir: string
  /**
   * Default true — pass `--locked` so a lock-vs-manifest drift fails hard.
   * Set false ONLY to bootstrap/refresh a lock (never in a verify path).
   */
  readonly locked?: boolean | undefined
}

export interface UvExportMaterializeOptions {
  /**
   * Absolute path to the `uv` executable.
   */
  readonly uvBin: string
  /**
   * Absolute path to the uv project dir to export from.
   */
  readonly projectDir: string
  /**
   * Override the content-addressed target dir. Defaults to
   * `uvProjectTargetDir(projectDir)`.
   */
  readonly targetDir?: string | undefined
}

export interface UvExportMaterializeResult {
  /**
   * `true` when this call ran uv; `false` when an existing install was reused.
   */
  readonly installed: boolean
  /**
   * Directory the closure was installed into. Put this on `PYTHONPATH` to run
   * the tool: `python -m <module>`.
   */
  readonly targetDir: string
}
