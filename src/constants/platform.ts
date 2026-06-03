/**
 * @file Platform detection and OS-specific constants.
 */

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
 * Get the current CPU architecture (memoized).
 */
export function getArch(): Arch {
  if (memoizedArch === undefined) {
    memoizedArch = getNodeOs().arch()
  }
  return memoizedArch
}

let memoizedPlatform: Platform | undefined

/**
 * Get the current platform (memoized).
 */
export function getPlatform(): Platform {
  if (memoizedPlatform === undefined) {
    memoizedPlatform = getNodeOs().platform()
  }
  return memoizedPlatform
}

let memoizedPlatformAndArch: string | undefined

/**
 * Get the current `platform-arch` host token (memoized), e.g. `darwin-arm64`,
 * `linux-x64`, `win32-x64`. Raw Node vocabulary — `process.platform` joined to
 * `process.arch` with a `-`. Tool-specific resolvers that need a different
 * vocabulary (python-build-standalone's `win`, Adoptium's `-musl`) layer their
 * own mapping on top — see `getPythonArch` / `getJreArch`.
 */
export function getPlatformAndArch(): string {
  if (memoizedPlatformAndArch === undefined) {
    memoizedPlatformAndArch = `${getPlatform()}-${getArch()}`
  }
  return memoizedPlatformAndArch
}

// Platform detection (memoized at module load).
export const DARWIN = getPlatform() === 'darwin'
export const WIN32 = getPlatform() === 'win32'

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
