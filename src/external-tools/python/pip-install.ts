/**
 * @file `pipInstallTarget()` — install a pip spec into a TARGET DIRECTORY
 *   (`pip install --target <dir>`), the Python mirror of how `dlx/package.ts`
 *   installs npm deps into `<dlxDir>/<hash>/node_modules/`. The interpreter is
 *   left pristine; the package + its deps land in an isolated dir you own.
 *
 *   This is the bundle-safe / SEA-VFS-safe model:
 *   - No venv → no symlinks, no `pyvenv.cfg` with an absolute `home=`.
 *   - The target dir is plain files → embeddable in a SEA's VFS, relocatable at
 *     runtime.
 *   - One shared Python serves N isolated target dirs (true per-tool isolation
 *     without a venv) — exactly the `node_modules`-per-cacheKey shape.
 *
 *   Run the installed tool with the target dir on `PYTHONPATH`:
 *     spawn(pythonBin, ['-m', '<module>', ...args],
 *       { env: { ...process.env, PYTHONPATH: targetDir } })
 *
 *   `spec` is a PyPI pin (`<pkg>==<version>`) or a git-SHA pin
 *   (`git+https://…@<sha>`). A TOCTOU lock guards concurrent installs into the
 *   same target; an `isInstalled` predicate makes the call idempotent.
 *
 *   Contrast `createPipVenv` (external-tools/from-pip-venv): venv with a
 *   `bin/<entryPoint>` — convenient but symlink + absolute-`home`-dependent, so
 *   DLX-only and NOT bundleable.
 */

// oxlint-disable-next-line socket/prefer-async-spawn -- pip needs streaming stdio; the lib promise wrapper rejects on nonzero and hides output.
import { spawn } from '../../process/spawn/child'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { WIN32 } from '../../constants/platform'
import { safeDelete, safeMkdir } from '../../fs/safe'
import { getSocketDlxDir } from '../../paths/socket'

import { generateCacheKey } from '../../dlx/cache'

const MAX_RETRIES = 3
const WAIT_TICKS = 30

export interface PipInstallTargetOptions {
  /**
   * Absolute path to the Python interpreter used to run pip (and later the
   * tool). The interpreter is NOT modified — packages go to `targetDir`.
   * Typically from `resolvePython()`.
   */
  readonly pythonBin: string
  /**
   * pip install spec: `<pkg>==<version>` (PyPI exact pin) or
   * `git+https://<url>@<sha>` (git-SHA pin).
   */
  readonly spec: string
  /**
   * Target directory for `pip install --target`. Defaults to
   * `~/.socket/_dlx/<cacheKey(spec)>/site-packages` — the Python analog of
   * `dlx/package.ts`'s `<hash>/node_modules`.
   */
  readonly targetDir?: string | undefined
  /**
   * Predicate returning true when the package is already importable from
   * `targetDir`, so the install is skipped. Typically a marker-file check
   * (`<targetDir>/<pkg>` exists) — cheaper than spawning Python.
   */
  readonly isInstalled?: (targetDir: string) => Promise<boolean> | boolean
}

export interface PipInstallTargetResult {
  /**
   * Directory the package was installed into. Put this on `PYTHONPATH` to run
   * the tool: `python -m <module>`.
   */
  readonly targetDir: string
  /**
   * `true` when this call ran pip; `false` when an existing install was reused.
   */
  readonly installed: boolean
}

/**
 * Default target dir for a spec: `~/.socket/_dlx/<cacheKey>/site-packages`.
 */
export function pipTargetDir(spec: string): string {
  return path.join(getSocketDlxDir(), generateCacheKey(spec), 'site-packages')
}

function isStaleLock(pid: number): boolean {
  if (Number.isNaN(pid) || pid <= 0) {
    return true
  }
  try {
    // Signal 0 probes existence without delivering a signal.
    process.kill(pid, 0)
    return false
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    // EPERM = exists but not ours (alive); ESRCH = gone (stale).
    return err.code !== 'EPERM'
  }
}

async function alreadyInstalled(
  targetDir: string,
  isInstalled: PipInstallTargetOptions['isInstalled'],
): Promise<boolean> {
  if (isInstalled) {
    return isInstalled(targetDir)
  }
  // Default: non-empty target dir counts as installed.
  try {
    const entries = await fs.readdir(targetDir)
    return entries.length > 0
  } catch {
    return false
  }
}

/**
 * Install `spec` into a target dir via `pip install --target`. Lock-guarded +
 * idempotent. Throws on a failed pip install or if the lock can't be acquired
 * after MAX_RETRIES.
 */
export async function pipInstallTarget(
  opts: PipInstallTargetOptions,
  retryCount = 0,
): Promise<PipInstallTargetResult> {
  const { isInstalled, pythonBin, spec } = opts
  const targetDir = opts.targetDir ?? pipTargetDir(spec)
  if (retryCount >= MAX_RETRIES) {
    throw new Error(
      `pipInstallTarget: could not acquire install lock after ${MAX_RETRIES} retries for ${targetDir}; a peer may be stuck or the lock is stale — remove it and retry`,
    )
  }
  if (await alreadyInstalled(targetDir, isInstalled)) {
    return { targetDir, installed: false }
  }
  // The lock lives one level up so a `--clear`-style wipe of targetDir can't
  // delete the lock mid-install.
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
      return pipInstallTarget(opts, retryCount + 1)
    }
    for (let i = 0; i < WAIT_TICKS; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential poll by design.
      await new Promise(resolve => {
        setTimeout(resolve, 1000)
      })
      // eslint-disable-next-line no-await-in-loop -- sequential poll by design.
      if (await alreadyInstalled(targetDir, isInstalled)) {
        return { targetDir, installed: false }
      }
    }
    return pipInstallTarget(opts, retryCount + 1)
  }

  try {
    await safeMkdir(targetDir, { recursive: true })
    await spawn(
      pythonBin,
      ['-m', 'pip', 'install', '--no-input', '--quiet', '--target', targetDir, spec],
      { shell: WIN32, stdio: 'inherit' },
    )
    if (!(await alreadyInstalled(targetDir, isInstalled))) {
      throw new Error(
        `pipInstallTarget: pip install --target ${targetDir} ${spec} reported success but the target is still empty`,
      )
    }
    return { targetDir, installed: true }
  } finally {
    await safeDelete(lockFile, { force: true })
  }
}
