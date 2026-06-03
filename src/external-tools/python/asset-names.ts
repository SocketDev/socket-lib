/**
 * @file python-build-standalone release asset mapping. Astral publishes
 *   per-platform CPython archives under
 *   https://github.com/astral-sh/python-build-standalone/releases/download/<tag>/.
 *   Asset name shape: `cpython-<version>+<tag>-<triple>-install_only.tar.gz`.
 *   The `install_only` flavor is a relocatable runtime (no build artifacts),
 *   extracted one directory deep (`python/bin/python3`).
 */

import process from 'node:process'

import { ObjectFreeze } from '../../primordials/object'

// platform-arch → python-build-standalone target triple. The `install_only`
// archives ship glibc Linux only (no musl variant), so linux-*-musl maps to
// the gnu triple — fine for the relocatable runtime on most musl hosts via the
// bundled libs, and the only option upstream provides.
const PLATFORM_TRIPLES: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'win-arm64': 'aarch64-pc-windows-msvc',
  'win-x64': 'x86_64-pc-windows-msvc',
}) as unknown as Readonly<Record<string, string>>

// node platform → python-build-standalone platform segment. Node reports
// `win32`; python-build-standalone keys on `win`. macOS/Linux pass through.
const NODE_PLATFORM_TO_PY: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win',
}) as unknown as Readonly<Record<string, string>>

// node arch → python-build-standalone arch segment.
const NODE_ARCH_TO_PY: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  arm64: 'arm64',
  x64: 'x64',
}) as unknown as Readonly<Record<string, string>>

const RELEASE_BASE =
  'https://github.com/astral-sh/python-build-standalone/releases/download'

/**
 * Resolve the current host to a python-build-standalone `platform-arch` key
 * (a `PLATFORM_TRIPLES` key, e.g. `darwin-arm64`, `win-x64`). Owns the
 * python-build-standalone vocabulary end to end: Node's `win32` becomes `win`,
 * and libc is intentionally ignored — the `install_only` archives are
 * glibc-only, so musl hosts map to the same `linux-<arch>` key (the relocatable
 * runtime works on most musl systems via bundled libs). Returns `undefined`
 * when the host platform/arch has no upstream prebuilt.
 *
 * Separate from `getJreArch` (jre/Adoptium vocabulary, emits a `-musl` suffix)
 * and from the shared `getPlatformArch` — neither matches
 * python-build-standalone's key set.
 */
export function getPythonArch(): string | undefined {
  /* c8 ignore start - depends on process.platform/arch. */
  const platform = NODE_PLATFORM_TO_PY[process.platform]
  const arch = NODE_ARCH_TO_PY[process.arch]
  if (!platform || !arch) {
    return undefined
  }
  const key = `${platform}-${arch}`
  return PLATFORM_TRIPLES[key] ? key : undefined
  /* c8 ignore stop */
}

export interface PythonAssetOptions {
  /**
   * CPython version, e.g. `3.11.14`.
   */
  readonly version: string
  /**
   * python-build-standalone release tag, e.g. `20260203`.
   */
  readonly tag: string
  /**
   * Target `platform-arch`, e.g. `darwin-arm64`. Omit to auto-detect the
   * current host via {@link getPythonArch}; pass an explicit value to
   * resolve the asset for a different target (e.g. cross-platform packaging).
   */
  readonly arch?: string | undefined
}

export interface PythonAsset {
  /**
   * Full asset filename:
   * `cpython-<version>+<tag>-<triple>-install_only.tar.gz`.
   */
  readonly assetName: string
  /**
   * Absolute download URL for the asset (with `+` percent-encoded as `%2B`).
   */
  readonly url: string
}

/**
 * Resolve the python-build-standalone download for a version + tag + platform.
 * Returns the asset filename and URL, or `undefined` when the platform-arch has
 * no upstream prebuilt.
 */
export function pythonAsset(opts: PythonAssetOptions): PythonAsset | undefined {
  const { tag, version } = opts
  const arch = opts.arch ?? getPythonArch()
  const triple = arch ? PLATFORM_TRIPLES[arch] : undefined
  if (!triple) {
    return undefined
  }
  const assetName = `cpython-${version}+${tag}-${triple}-install_only.tar.gz`
  // Percent-encode the `+` between version and tag in the URL path.
  const encodedVersion = `${version}%2B${tag}`
  const url = `${RELEASE_BASE}/${tag}/cpython-${encodedVersion}-${triple}-install_only.tar.gz`
  return { assetName, url }
}
