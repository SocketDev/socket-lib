/**
 * @file Platform detection and OS-specific constants.
 */

import { existsSync } from 'node:fs'

import { getNodeOs } from '../node/os'

/**
 * CPU architecture type.
 */
export type Arch = NodeJS.Architecture

/**
 * Linux libc variant.
 */
export type Libc = 'glibc' | 'musl'

/**
 * Operating system platform type.
 */
export type Platform = NodeJS.Platform

let memoizedArch: Arch | undefined

/**
 * Get the current CPU architecture (memoized), e.g. `x64`, `arm64`.
 */
export function getArch(): Arch {
  if (memoizedArch === undefined) {
    const os = getNodeOs()
    memoizedArch = os.arch()
  }
  return memoizedArch
}

// musl dynamic-linker paths — present only on musl (Alpine-and-similar) hosts.
const MUSL_LINKERS = [
  '/lib/ld-musl-x86_64.so.1',
  '/lib/ld-musl-aarch64.so.1',
  '/usr/lib/ld-musl-x86_64.so.1',
  '/usr/lib/ld-musl-aarch64.so.1',
]

let memoizedLibc: Libc | undefined
let memoizedLibcProbed = false

/**
 * Get the host libc variant (memoized): `'musl'` on Alpine-and-similar,
 * `'glibc'` on other Linux, `undefined` off-Linux. Detected by probing for the
 * musl dynamic linker. The single source of truth for libc detection —
 * tool-specific resolvers (`getPythonArch`, `getJreArch`) call this rather than
 * re-probing.
 */
export function getLibc(): Libc | undefined {
  if (!memoizedLibcProbed) {
    memoizedLibcProbed = true
    /* c8 ignore start - Linux-only filesystem probe. */
    if (getOs() !== 'linux') {
      memoizedLibc = undefined
    } else {
      memoizedLibc = 'glibc'
      for (let i = 0, { length } = MUSL_LINKERS; i < length; i += 1) {
        if (existsSync(MUSL_LINKERS[i]!)) {
          memoizedLibc = 'musl'
          break
        }
      }
    }
    /* c8 ignore stop */
  }
  return memoizedLibc
}

let memoizedOs: Platform | undefined

/**
 * Get the current OS (memoized), e.g. `darwin`, `linux`, `win32` — the raw
 * `process.platform` value.
 */
export function getOs(): Platform {
  if (memoizedOs === undefined) {
    const os = getNodeOs()
    memoizedOs = os.platform()
  }
  return memoizedOs
}

let memoizedTarget: string | undefined

/**
 * Get the current host **target** in the pnpm `pack-app` vocabulary (memoized):
 * `<os>-<arch>[-<libc>]`, e.g. `darwin-arm64`, `linux-x64`, `win32-x64`,
 * `linux-x64-musl`. Raw Node `process.platform`/`process.arch` joined with `-`,
 * plus a `-musl` suffix on Alpine. This is the fleet-general naming for
 * non-python / non-JRE tools (matches pnpm's release assets,
 * `pnpm-<os>-<arch>[-<libc>].{tar.gz,zip}`). Tool-specific resolvers that need
 * a different vocabulary own their own helper — see `getPythonArch`
 * (python-build- standalone) / `getJreArch` (Adoptium).
 */
export function getTarget(): string {
  if (memoizedTarget === undefined) {
    const libc = getLibc()
    const libcSuffix = libc === 'musl' ? '-musl' : ''
    memoizedTarget = `${getOs()}-${getArch()}${libcSuffix}`
  }
  return memoizedTarget
}

// Platform detection (memoized at module load).
export const DARWIN = getOs() === 'darwin'
export const WIN32 = getOs() === 'win32'

/**
 * True when this process was launched as a Chrome (or Chromium) native
 * messaging host. Chrome passes the extension origin URL
 * (`chrome-extension://<id>/`) as `process.argv[2]`; no other invocation shape
 * produces that prefix.
 */
export const NATIVE_MESSAGING_HOST =
  typeof process !== 'undefined' &&
  typeof process.argv[2] === 'string' &&
  process.argv[2].startsWith('chrome-extension://')

// File permission modes.
export const S_IXUSR = 0o100
export const S_IXGRP = 0o010
export const S_IXOTH = 0o001
