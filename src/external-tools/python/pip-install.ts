/**
 * @file `downloadPipPackage()` — the Python mirror of `dlx/package.ts`'s
 *   `downloadNpmPackage()`. Installs a pip spec into a content-addressed dlx
 *   directory (`pip install --target <dir>`), leaving the interpreter pristine:
 *   the package + its deps land in
 *   `~/.socket/_dlx/<cacheKey(spec)>/site-packages`, the exact analog of how
 *   `downloadNpmPackage` installs npm deps into
 *   `<dlxDir>/<hash>/node_modules/`. This is the bundle-safe / SEA-VFS-safe
 *   model:
 *
 *   - No venv → no symlinks, no `pyvenv.cfg` with an absolute `home=`.
 *   - The target dir is plain files → embeddable in a SEA's VFS, relocatable at
 *     runtime.
 *   - One shared Python serves N isolated package dirs (true per-tool isolation
 *     without a venv) — exactly the `node_modules`-per-cacheKey shape. Run the
 *     installed tool with the package dir on `PYTHONPATH`: spawn(pythonBin,
 *     ['-m', '<module>', ...args], { env: { ...process.env, PYTHONPATH:
 *     packageDir } }) `spec` is a PyPI pin (`<pkg>==<version>`) or a git-SHA
 *     pin (`git+https://…@<sha>`). A TOCTOU lock guards concurrent installs; an
 *     existing non-empty package dir makes the call idempotent. Contrast
 *     `createPipVenv` (external-tools/from-pip-venv): venv with a
 *     `bin/<entryPoint>` — convenient but symlink + absolute-`home`-dependent,
 *     so DLX-only and NOT bundleable.
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

/**
 * Install `spec` into a content-addressed dlx dir via `pip install --target`.
 * Lock-guarded + idempotent. Throws on a failed pip install or if the lock
 * can't be acquired after MAX_RETRIES. Mirrors `downloadNpmPackage`.
 */
export async function downloadPipPackage(
  options: DownloadPipPackageOptions,
  retryCount = 0,
): Promise<DownloadPipPackageResult> {
  const { hash, pythonBin, spec } = {
    __proto__: null,
    ...options,
  } as typeof options
  const packageDir = pipPackageDir(spec)
  if (retryCount >= MAX_RETRIES) {
    throw new Error(
      `downloadPipPackage: could not acquire install lock after ${MAX_RETRIES} retries for ${packageDir}; a peer may be stuck or the lock is stale — remove it and retry`,
    )
  }
  if (await isAlreadyInstalled(packageDir)) {
    return { installed: false, packageDir }
  }
  // The lock lives one level up so a `--clear`-style wipe of packageDir can't
  // delete the lock mid-install.
  const lockDir = path.dirname(packageDir)
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
      return downloadPipPackage(options, retryCount + 1)
    }
    for (let i = 0; i < WAIT_TICKS; i += 1) {
      await new Promise(resolve => {
        setTimeout(resolve, 1000)
      })
      if (await isAlreadyInstalled(packageDir)) {
        return { installed: false, packageDir }
      }
    }
    return downloadPipPackage(options, retryCount + 1)
  }

  try {
    await safeMkdir(packageDir, { recursive: true })
    // A bare hex hash is normalized to pip's `sha256:<hex>` form. `--hash`
    // requires `--require-hashes`, which fails closed unless every resolved
    // artifact is hash-pinned.
    const normalizedHash = hash
      ? hash.startsWith('sha256:')
        ? hash
        : `sha256:${hash}`
      : undefined
    const hashArgs = normalizedHash
      ? ['--require-hashes', `--hash=${normalizedHash}`]
      : []
    await spawn(
      pythonBin,
      [
        '-m',
        'pip',
        'install',
        '--no-input',
        '--quiet',
        '--target',
        packageDir,
        ...hashArgs,
        spec,
      ],
      { shell: WIN32, stdio: 'inherit' },
    )
    if (!(await isAlreadyInstalled(packageDir))) {
      throw new Error(
        `downloadPipPackage: pip install --target ${packageDir} ${spec} reported success but the target is still empty`,
      )
    }
    return { installed: true, packageDir }
  } finally {
    await safeDelete(lockFile, { force: true })
  }
}

export async function isAlreadyInstalled(packageDir: string): Promise<boolean> {
  // A non-empty package dir counts as installed.
  try {
    const entries = await fs.readdir(packageDir)
    return entries.length > 0
  } catch {
    return false
  }
}

export function isStaleLock(pid: number): boolean {
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

export interface DownloadPipPackageOptions {
  /**
   * Optional sha256 hash (`sha256:<hex>` or bare `<hex>`) of the top-level
   * artifact, the Python analog of `downloadNpmPackage`'s `hash`. When set, pip
   * runs with `--require-hashes` and `--hash=sha256:<hex>`, which fails closed
   * unless EVERY resolved artifact (the spec and its full dependency closure)
   * carries a matching hash — so it only fits specs pip can hash-verify (a
   * pinned `==<version>` or a direct wheel/sdist URL) with a hash-pinned
   * closure. Omit it and rely on the immutable spec as the pin: `==<version>`
   * (PyPI is immutable per version) or `@<full-sha>` (git is
   * content-addressed).
   */
  readonly hash?: string | undefined
  /**
   * Absolute path to the Python interpreter used to run pip (and later the
   * tool). The interpreter is NOT modified — packages go to the dlx package
   * dir. Typically from `resolvePython()`.
   */
  readonly pythonBin: string
  /**
   * Pip install spec: `<pkg>==<version>` (PyPI exact pin) or
   * `git+https://<url>@<sha>` (git-SHA pin).
   */
  readonly spec: string
}

export interface DownloadPipPackageResult {
  /**
   * `true` when this call ran pip; `false` when an existing install was reused.
   */
  readonly installed: boolean
  /**
   * Directory the package was installed into. Put this on `PYTHONPATH` to run
   * the tool: `python -m <module>`. The Python analog of
   * `DownloadNpmPackageResult.packageDir`.
   */
  readonly packageDir: string
}

/**
 * Content-addressed install dir for a spec:
 * `~/.socket/_dlx/<cacheKey>/site-packages`. The Python analog of
 * `downloadNpmPackage`'s `<hash>/node_modules`.
 */
export function pipPackageDir(spec: string): string {
  return path.join(getSocketDlxDir(), generateCacheKey(spec), 'site-packages')
}
