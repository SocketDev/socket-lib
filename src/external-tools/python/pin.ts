/**
 * @file `resolvePipPackagePin()` — the Python mirror of
 *   `resolveNpmPackagePin()` (dlx/lockfile). Resolves a pip spec and its full
 *   dependency closure WITHOUT installing into the interpreter, then returns
 *   everything needed to pin a reproducible, hash-verified install:
 *
 *   - the resolved top-level name + version,
 *   - the top-level artifact's hashes (sha512 SRI + sha256 hex), and
 *   - a fully-hashed `requirements.txt` body (`name==version --hash=sha256:<hex>`
 *     for every artifact in the closure) ready to feed back to
 *     `downloadPipPackage` / `pip install --require-hashes`. Engine: `pip
 *     download --dest <scratch> <spec>` downloads the spec + its resolved
 *     closure as wheels/sdists into a scratch dir (no install, no venv), each
 *     file is hashed, then the scratch dir is torn down. This is pip's own
 *     recipe for producing hashed requirements — `pip-tools` is NOT required.
 *     Contrast `resolveNpmPackagePin` (dlx/lockfile): same contract, npm engine
 *     (Arborist lockfile-only + pacote), emits a `package-lock.json`. The pip
 *     side emits a hashed `requirements.txt` because that — not a lockfile — is
 *     what `pip install --require-hashes` consumes. NOTE on the soak window:
 *     `resolveNpmPackagePin` applies a min-release-age cutoff via Arborist's
 *     `before` date. pip has no native release-age gate, so this generator does
 *     NOT enforce one — callers that need a soak must vet the resolved versions
 *     out of band. The spec itself remains the primary pin: `==<version>` (PyPI
 *     is immutable per version) or `@<full-sha>` (git is content-addressed).
 */

// oxlint-disable-next-line socket/prefer-async-spawn -- pip download streams progress; the lib promise wrapper rejects on nonzero and hides output.
import { spawn } from '../../process/spawn/child'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { WIN32 } from '../../constants/platform'
import { safeDelete, safeMkdir } from '../../fs/safe'
import { computeHashes } from '../../integrity'

import type { ComputedHashes } from '../../integrity'

export interface ResolvePipPackagePinOptions {
  /**
   * Absolute path to the Python interpreter used to run `pip download`,
   * typically from `resolvePython()`. The interpreter is NOT modified.
   */
  readonly pythonBin: string
  /**
   * Directory `pip download` resolves the closure into. Defaults to a unique
   * scratch dir under the OS temp dir, removed before returning.
   */
  readonly scratchDir?: string | undefined
  /**
   * Pip spec to pin: `<pkg>==<version>` (PyPI exact pin) or
   * `git+https://<url>@<sha>` (git-SHA pin).
   */
  readonly spec: string
}

export interface PipArtifactPin {
  /**
   * Sha256 hex of the artifact, the `--hash=sha256:<hex>` value pip expects.
   */
  readonly checksum: string
  /**
   * Downloaded artifact filename, e.g. `is_odd-3.0.1-py3-none-any.whl`.
   */
  readonly file: string
  /**
   * Distribution name parsed from the filename, e.g. `is-odd`.
   */
  readonly name: string
  /**
   * Distribution version parsed from the filename, e.g. `3.0.1`.
   */
  readonly version: string
}

export interface PipPackagePin {
  /**
   * Per-artifact pins for the full resolved closure (top-level + transitive).
   */
  readonly artifacts: readonly PipArtifactPin[]
  /**
   * Hashes of the top-level artifact (sha512 SRI + sha256 hex). The Python
   * analog of `NpmPackagePin.hash`.
   */
  readonly hash: ComputedHashes
  /**
   * Resolved top-level distribution name.
   */
  readonly name: string
  /**
   * Fully-hashed `requirements.txt` content, ready to write to disk and feed to
   * `pip install --require-hashes -r <file>`. The Python analog of
   * `NpmPackagePin.lockfile`.
   */
  readonly requirements: string
  /**
   * Resolved top-level distribution version.
   */
  readonly version: string
}

/**
 * Thrown when `pip download` produces no artifacts or a filename can't be
 * parsed into a name + version.
 */
export class PipPackagePinError extends Error {
  constructor(
    message: string,
    options?: { cause?: unknown | undefined } | undefined,
  ) {
    super(message, options)
    this.name = 'PipPackagePinError'
  }
}

/**
 * Normalize a PEP 503 distribution name: lowercase, runs of `_ . -` collapse to
 * a single `-`. Wheel filenames use `_`; requirements/PyPI use `-`.
 */
export function normalizeDistName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

/**
 * Parse `<name>-<version>` out of a wheel (`name-ver-...whl`) or sdist
 * (`name-ver.tar.gz` / `name-ver.zip`) filename. Returns undefined when the
 * shape isn't recognized.
 */
export function parseArtifactFilename(
  file: string,
): { name: string; version: string } | undefined {
  // Wheel: name-version-pythontag-abi-platform.whl — name + version are the
  // first two `-`-delimited fields.
  if (file.endsWith('.whl')) {
    const parts = file.slice(0, -'.whl'.length).split('-')
    if (parts.length < 2) {
      return undefined
    }
    return { name: normalizeDistName(parts[0]!), version: parts[1]! }
  }
  // sdist: name-version.<ext>. Strip the extension, then split on the LAST `-`
  // (names may contain `-`, versions start with a digit).
  const ext = ['.tar.gz', '.tar.bz2', '.zip', '.tgz'].find(e =>
    file.endsWith(e),
  )
  if (!ext) {
    return undefined
  }
  const stem = file.slice(0, -ext.length)
  const dashIdx = stem.lastIndexOf('-')
  if (dashIdx <= 0) {
    return undefined
  }
  return {
    name: normalizeDistName(stem.slice(0, dashIdx)),
    version: stem.slice(dashIdx + 1),
  }
}

/**
 * Generate a vendorable, hash-pinned closure for a pip spec without installing
 * it. Mirrors `resolveNpmPackagePin`. Throws `PipPackagePinError` on an empty
 * download or an unparseable artifact filename.
 */
export async function resolvePipPackagePin(
  options: ResolvePipPackagePinOptions,
): Promise<PipPackagePin> {
  const { pythonBin, spec } = { __proto__: null, ...options } as typeof options
  if (typeof spec !== 'string' || spec.length === 0) {
    throw new PipPackagePinError('resolvePipPackagePin requires a package spec')
  }
  const scratch =
    options.scratchDir ??
    path.join(os.tmpdir(), `socket-lib-pip-pin-${process.pid}-${Date.now()}`)
  await safeMkdir(scratch, { recursive: true })
  try {
    await spawn(
      pythonBin,
      [
        '-m',
        'pip',
        'download',
        '--no-input',
        '--quiet',
        '--dest',
        scratch,
        spec,
      ],
      { shell: WIN32, stdio: 'inherit' },
    )
    const files = (await fs.readdir(scratch)).filter(
      f =>
        f.endsWith('.whl') ||
        f.endsWith('.tar.gz') ||
        f.endsWith('.tar.bz2') ||
        f.endsWith('.zip') ||
        f.endsWith('.tgz'),
    )
    if (!files.length) {
      throw new PipPackagePinError(
        `resolvePipPackagePin: pip download ${spec} produced no artifacts in ${scratch}`,
      )
    }
    const artifacts: PipArtifactPin[] = []
    const targetName = normalizeDistName(specDistName(spec))
    let top: { hash: ComputedHashes; name: string; version: string } | undefined
    for (const file of files.toSorted()) {
      // eslint-disable-next-line no-await-in-loop -- bounded by closure size.
      const bytes = await fs.readFile(path.join(scratch, file))
      const hash = computeHashes(bytes)
      const parsed = parseArtifactFilename(file)
      if (!parsed) {
        throw new PipPackagePinError(
          `resolvePipPackagePin: could not parse name/version from artifact ${file}`,
        )
      }
      artifacts.push({
        checksum: hash.checksum,
        file,
        name: parsed.name,
        version: parsed.version,
      })
      if (!top && parsed.name === targetName) {
        top = { hash, name: parsed.name, version: parsed.version }
      }
    }
    // Fall back to the first artifact when the spec name (e.g. a git URL)
    // doesn't match any filename.
    if (!top) {
      const first = artifacts[0]!
      const bytes = await fs.readFile(path.join(scratch, first.file))
      top = {
        hash: computeHashes(bytes),
        name: first.name,
        version: first.version,
      }
    }
    const requirements =
      artifacts
        .map(a => `${a.name}==${a.version} --hash=sha256:${a.checksum}`)
        .join('\n') + '\n'
    return {
      artifacts,
      hash: top.hash,
      name: top.name,
      requirements,
      version: top.version,
    }
  } finally {
    // Swallow cleanup failures so a scratch-dir-delete error doesn't mask the
    // real exception from the try-block.
    try {
      await safeDelete(scratch, { force: true })
    } catch {}
  }
}

/**
 * Best-effort distribution name from a pip spec for matching the top-level
 * artifact: strips a `==`/`>=`/etc. version and a `git+...#egg=<name>`
 * fragment. Falls back to the raw spec when neither is present.
 */
export function specDistName(spec: string): string {
  const eggIdx = spec.indexOf('#egg=')
  if (eggIdx !== -1) {
    return spec.slice(eggIdx + '#egg='.length)
  }
  // Pull the package name off the front of a pip requirement spec: group 1 is
  // the name (letters/digits/`._-`), stopping at the first version/URL operator
  // — `@` (PEP 508 URL/extra) or a comparator (`==`, `>=`, `<`, `!=`, `~=`).
  const match = /^([A-Za-z0-9._-]+)\s*(?:@|[=<>!~]=?)/.exec(spec)
  return match ? match[1]! : spec
}
