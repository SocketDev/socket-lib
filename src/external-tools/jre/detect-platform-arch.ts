/**
 * @file `getJreArch()` — resolves the current machine to a `platform-arch`
 *   string suitable for the Adoptium `ADOPTIUM_QUERY_MAP` keys (e.g.
 *   `darwin-arm64`, `linux-x64-musl`, `win-x64`). Self-contained: owns the
 *   Adoptium vocabulary end to end (Node's `win32` → `win`, an Alpine `-musl`
 *   suffix on Linux) rather than reusing the shared `getPlatformArch` /
 *   `detectLibc` — Adoptium ships a distinct `alpine-linux` channel, so the JRE
 *   key set differs from both the release-binary naming and
 *   python-build-standalone (see `getPythonArch`). Returns `undefined` on an
 *   unsupported platform/arch.
 */

import process from 'node:process'

import { getLibc } from '../../constants/platform'
import { ObjectFreeze } from '../../primordials/object'

// node platform → Adoptium platform segment. Node reports `win32`; the JRE keys
// use `win`. macOS/Linux pass through.
const NODE_PLATFORM_TO_JRE: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win',
}) as unknown as Readonly<Record<string, string>>

// node arch → Adoptium arch segment.
const NODE_ARCH_TO_JRE: Readonly<Record<string, string>> = ObjectFreeze({
  __proto__: null,
  arm64: 'arm64',
  x64: 'x64',
}) as unknown as Readonly<Record<string, string>>

export function getJreArch(): string | undefined {
  /* c8 ignore start - depends on process.platform/arch + libc probe. */
  const platform = NODE_PLATFORM_TO_JRE[process.platform]
  const arch = NODE_ARCH_TO_JRE[process.arch]
  if (!platform || !arch) {
    return undefined
  }
  // Adoptium ships a separate `alpine-linux` channel, keyed here as `-musl`.
  const muslSuffix = platform === 'linux' && getLibc() === 'musl' ? '-musl' : ''
  return `${platform}-${arch}${muslSuffix}`
  /* c8 ignore stop */
}
