/**
 * @file Python-build-standalone release asset mapping. Astral publishes
 *   per-platform CPython archives under
 *   https://github.com/astral-sh/python-build-standalone/releases/download/<tag>/.
 *   Asset name shape: `cpython-<version>+<tag>-<triple>-install_only.tar.gz`.
 *   The `install_only` flavor is a relocatable runtime (no build artifacts),
 *   extracted one directory deep (`python/bin/python3`).
 */

import process from 'node:process'

import { getLibc } from '../../constants/platform'
import { ObjectFreeze } from '../../primordials/object'

// platform-arch → python-build-standalone target triple. Upstream ships both
// gnu (glibc) and musl Linux builds, so musl hosts get the real musl triple
// (an Alpine interpreter linked against the right libc) rather than a glibc
// fallback. Keys mirror the host tokens `getPythonArch` emits.
const PLATFORM_TRIPLES: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-arm64-musl': 'aarch64-unknown-linux-musl',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-x64-musl': 'x86_64-unknown-linux-musl',
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
 * Python-build-standalone default pin — the fleet-canonical CPython build,
 * matching socket-cli's `bundle-tools.json`. Consumers that don't pass their
 * own pin resolve against this. Bump it like any dependency (soak-aware), in
 * lockstep with socket-cli (drift-watch). The `checksums` map is keyed by asset
 * filename so the download tier verifies the exact tarball per platform.
 */
export const DEFAULT_PYTHON_PIN = ObjectFreeze({
  __proto__: null,
  version: '3.11.14',
  tag: '20260203',
  checksums: ObjectFreeze({
    __proto__: null,
    'cpython-3.11.14+20260203-aarch64-apple-darwin-install_only.tar.gz':
      '63e3352fefd3b6494f73f46f51c6581c57a7e0d98775e6e00229d14a67ec3ce9',
    'cpython-3.11.14+20260203-aarch64-pc-windows-msvc-install_only.tar.gz':
      'cb7828c131a005da367f7dba3a561bed91619452de870e531ee03344b2ac346f',
    'cpython-3.11.14+20260203-aarch64-unknown-linux-gnu-install_only.tar.gz':
      '7341a5a0acd65f2c7c7a228d8bafa6561d220ffed26293d6a02c15ae2ee86af5',
    'cpython-3.11.14+20260203-aarch64-unknown-linux-musl-install_only.tar.gz':
      'f0e5988c108187b12eb4d53cbac33a499a8e38e1693104432e1faabbab14c664',
    'cpython-3.11.14+20260203-x86_64-apple-darwin-install_only.tar.gz':
      'f3b63051a9b1ffb4f663d928ebaec4311435cb67f3bdfa5634953df93397f25e',
    'cpython-3.11.14+20260203-x86_64-pc-windows-msvc-install_only.tar.gz':
      'd220beff465bdc97bf5874be8ffbf07278e5bdf9a064cab932b5d93b542e3e86',
    'cpython-3.11.14+20260203-x86_64-unknown-linux-gnu-install_only.tar.gz':
      '67abde21b6e074b58c0f738f0c4802b23827a7d49707dcaf3ed4dadf572f3f37',
    'cpython-3.11.14+20260203-x86_64-unknown-linux-musl-install_only.tar.gz':
      '290de5199a9647d4de4adcf13a79a7c59f060357853bf41fd6d1a69b4b5fd00c',
  }),
})

/**
 * Resolve the current host to a python-build-standalone `platform-arch` key (a
 * `PLATFORM_TRIPLES` key, e.g. `darwin-arm64`, `linux-x64-musl`, `win-x64`).
 * Owns the python-build-standalone vocabulary end to end: Node's `win32`
 * becomes `win`, and an Alpine host gets a `-musl` suffix so it resolves to the
 * real musl triple (upstream ships both gnu and musl Linux builds). Returns
 * `undefined` when the host platform/arch has no upstream prebuilt.
 *
 * Separate from `getJreArch` (jre/Adoptium vocabulary) and from the shared
 * `getPlatformArch` — neither matches python-build-standalone's key set.
 */
export function getPythonArch(): string | undefined {
  /* c8 ignore start - depends on process.platform/arch + libc probe. */
  const platform = NODE_PLATFORM_TO_PY[process.platform]
  const arch = NODE_ARCH_TO_PY[process.arch]
  if (!platform || !arch) {
    return undefined
  }
  const muslSuffix = platform === 'linux' && getLibc() === 'musl' ? '-musl' : ''
  const key = `${platform}-${arch}${muslSuffix}`
  return PLATFORM_TRIPLES[key] ? key : undefined
  /* c8 ignore stop */
}

export interface PythonAssetOptions {
  /**
   * CPython version, e.g. `3.11.14`.
   */
  readonly version: string
  /**
   * Python-build-standalone release tag, e.g. `20260203`.
   */
  readonly tag: string
  /**
   * Target `platform-arch`, e.g. `darwin-arm64`. Omit to auto-detect the
   * current host via {@link getPythonArch}; pass an explicit value to resolve
   * the asset for a different target (e.g. cross-platform packaging).
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
