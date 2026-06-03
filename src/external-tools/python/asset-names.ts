/**
 * @file python-build-standalone release asset mapping. Astral publishes
 *   per-platform CPython archives under
 *   https://github.com/astral-sh/python-build-standalone/releases/download/<tag>/.
 *   Asset name shape: `cpython-<version>+<tag>-<triple>-install_only.tar.gz`.
 *   The `install_only` flavor is a relocatable runtime (no build artifacts),
 *   extracted one directory deep (`python/bin/python3`).
 */

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

const RELEASE_BASE =
  'https://github.com/astral-sh/python-build-standalone/releases/download'

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
   * Target `platform-arch`, e.g. `darwin-arm64`. Defaults to the current host
   * (`${os.platform-ish}-${os.arch}`) — but callers usually pass an explicit
   * value derived from `process.platform` / `process.arch`.
   */
  readonly platformArch: string
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
  const { platformArch, tag, version } = opts
  const triple = PLATFORM_TRIPLES[platformArch]
  if (!triple) {
    return undefined
  }
  const assetName = `cpython-${version}+${tag}-${triple}-install_only.tar.gz`
  // Percent-encode the `+` between version and tag in the URL path.
  const encodedVersion = `${version}%2B${tag}`
  const url = `${RELEASE_BASE}/${tag}/cpython-${encodedVersion}-${triple}-install_only.tar.gz`
  return { assetName, url }
}
