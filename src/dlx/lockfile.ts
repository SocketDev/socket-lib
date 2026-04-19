/**
 * @fileoverview Package pin generation for dlx installs.
 *
 * `generatePackagePin` resolves an npm package against the registry
 * using Arborist's lockfile-only mode and fetches its top-level tarball
 * to return both hash formats plus the lockfile content — everything
 * needed to vendor a reproducible install.
 *
 * The `LockfileSpec` type is also exported here for use as the
 * `lockfile` option on `downloadPackage`. Sniff/write handling lives
 * inline in `./package.ts` — no helper.
 */

import { tmpdir } from 'node:os'

import pacote from '../external/pacote'
import { safeDelete, safeMkdir } from '../fs'
import { safeIdealTree, writeSafeNpmrc } from './arborist'
import { computeHashes } from './integrity'

import type { ComputedHashes } from './integrity'

let _fs: typeof import('node:fs') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

let _path: typeof import('node:path') | undefined
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Lockfile source for the `lockfile` option on `downloadPackage`.
 *
 * Bare strings are sniffed: a leading `{` (after whitespace) means
 * JSON content, anything else is treated as a filesystem path. Pass the
 * explicit `{ type, value }` form to override sniffing.
 *
 * @example
 * // Sniffed as path:
 * './scripts/dlx/claude/package-lock.json'
 * // Sniffed as content:
 * '{ "lockfileVersion": 3, ... }'
 * // Explicit:
 * { type: 'path', value: '/abs/package-lock.json' }
 * { type: 'content', value: '{ ... }' }
 */
export type LockfileSpec =
  | string
  | { type: 'path'; value: string }
  | { type: 'content'; value: string }

/**
 * Default minimum release age in days applied when a caller passes
 * neither `minReleaseDays` nor `minReleaseMins`. Pass `minReleaseDays: 0`
 * to disable the cutoff explicitly.
 */
export const DEFAULT_MIN_RELEASE_DAYS = 7

/**
 * Options for generating a vendorable pin for an npm package.
 */
export interface GeneratePackagePinOptions {
  /** Package spec, e.g. `'@anthropic-ai/claude-code@2.1.92'`. */
  package: string
  /**
   * Minimum release age in days. Refuses to resolve any version (direct
   * or transitive) published more recently than `Date.now() - N days`.
   *
   * Matches npm's `min-release-age` config (unit: days). Mutually
   * exclusive with {@link minReleaseMins}. Defaults to
   * {@link DEFAULT_MIN_RELEASE_DAYS} (7) when neither field is set.
   * Pass `0` to disable.
   */
  minReleaseDays?: number | undefined
  /**
   * Minimum release age in minutes. Refuses to resolve any version
   * published more recently than `Date.now() - N minutes`.
   *
   * Matches pnpm's `minimumReleaseAge` config (unit: minutes). Mutually
   * exclusive with {@link minReleaseDays}.
   */
  minReleaseMins?: number | undefined
}

/**
 * Result of {@link generatePackagePin}. All file data is returned as
 * content — the caller decides whether/where to write it.
 */
export interface PinDetails {
  /** Resolved package name. */
  name: string
  /** Resolved package version. */
  version: string
  /** Both hash formats of the top-level tarball. */
  hash: ComputedHashes
  /** `package.json` JSON content, ready to write to disk. */
  packageJson: string
  /** `package-lock.json` JSON content, ready to write to disk. */
  lockfile: string
}

/**
 * Thrown when a lockfile spec is malformed (unrecognized string, missing
 * file, invalid JSON) or drifts from its package.json.
 */
export class DlxLockfileError extends Error {
  constructor(message: string, options?: { cause?: unknown } | undefined) {
    super(message, options)
    this.name = 'DlxLockfileError'
  }
}

/**
 * Extract the package name from a spec like `'name@range'` or
 * `'@scope/name@range'` or a bare `'name'`.
 */
function specName(spec: string): string {
  const atIdx = spec.lastIndexOf('@')
  if (atIdx <= 0) {
    return spec
  }
  return spec.slice(0, atIdx)
}

/**
 * Extract the version range (or `'latest'`) from a spec.
 */
function specRange(spec: string): string {
  const atIdx = spec.lastIndexOf('@')
  if (atIdx <= 0) {
    return 'latest'
  }
  return spec.slice(atIdx + 1) || 'latest'
}

/**
 * Generate a vendorable pin for an npm package without installing it.
 *
 * Runs Arborist in lockfile-only mode (`packageLockOnly: true`) against a
 * temporary directory, fetches the top-level tarball once to compute
 * sha256 hex (since Arborist only exposes SRI from the registry), then
 * tears the tmp directory down before returning.
 *
 * The result contains everything a caller needs to pin the package for
 * future installs: the exact resolved name/version, both hash formats,
 * and the lockfile content (ready to commit).
 *
 * @example
 * ```ts
 * const pin = await generatePackagePin({
 *   package: '@anthropic-ai/claude-code@2.1.92',
 * })
 * await fs.writeFile('./claude.lock.json', pin.lockfile, 'utf8')
 * // pin.hash.integrity → 'sha512-…'
 * // pin.hash.checksum  → hex
 * ```
 */
export async function generatePackagePin(
  options: GeneratePackagePinOptions,
): Promise<PinDetails> {
  const fs = getFs()
  const path = getPath()
  const { minReleaseDays, minReleaseMins, package: spec } = options
  if (typeof spec !== 'string' || spec.length === 0) {
    throw new DlxLockfileError('generatePackagePin requires a package spec')
  }
  if (minReleaseDays !== undefined && minReleaseMins !== undefined) {
    throw new DlxLockfileError(
      'generatePackagePin: minReleaseDays and minReleaseMins are mutually exclusive',
    )
  }
  const effectiveDays =
    minReleaseDays !== undefined
      ? minReleaseDays
      : minReleaseMins !== undefined
        ? undefined
        : DEFAULT_MIN_RELEASE_DAYS
  const ageMs =
    effectiveDays !== undefined
      ? effectiveDays * 86_400_000
      : minReleaseMins !== undefined
        ? minReleaseMins * 60_000
        : 0
  const before = ageMs > 0 ? new Date(Date.now() - ageMs) : undefined
  const scratch = path.join(
    tmpdir(),
    `socket-lib-pin-${process.pid}-${Date.now()}`,
  )
  await safeMkdir(scratch, { recursive: true })
  try {
    const packageJson = JSON.stringify(
      {
        name: 'socket-lib-pin',
        version: '0.0.0',
        private: true,
        dependencies: { [specName(spec)]: specRange(spec) },
      },
      null,
      2,
    )
    await fs.promises.writeFile(
      path.join(scratch, 'package.json'),
      packageJson + '\n',
      'utf8',
    )
    await writeSafeNpmrc(scratch, {
      minReleaseDays: effectiveDays,
      minReleaseMins,
    })
    const ideal = await safeIdealTree({ path: scratch, before })
    const tarball = await pacote.tarball(`${ideal.name}@${ideal.version}`)
    const hash = computeHashes(tarball)
    return {
      name: ideal.name,
      version: ideal.version,
      hash,
      packageJson,
      lockfile: ideal.lockfile,
    }
  } finally {
    // Swallow cleanup failures so a scratch-dir-delete error doesn't
    // mask the real exception from the try-block.
    try {
      await safeDelete(scratch, { force: true })
    } catch {}
  }
}
